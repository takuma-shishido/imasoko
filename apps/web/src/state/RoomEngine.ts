// プロトタイプ(いまそこ Prototype.dc.html)の `Component extends DCLogic` を、
// フレームワーク非依存の状態機械クラスとして 1:1 移植したもの。
// this.setState → 内部マージ + 購読者通知、React.createRef → 素の ref オブジェクトに置換。
// 派生値は renderVals()(プロトタイプと同名)で計算する。

import type { RefObject } from "react";
import type { AreaId, DemoRoom, MeetingPoint, Member, PlaceSuggestion } from "@/types/campus";
import { AREAS } from "@/lib/mapAreas";
import {
  BUILDINGS,
  bAnchor,
  bById,
  bSpot,
  mergeCampus,
  roomFull,
  roomLookup,
  setBuildings,
} from "@/lib/campusData";
import {
  POSITION_MIN_MOVE_M,
  POSITION_THROTTLE_MS,
  serverConfig,
  setServerConfig,
} from "@/lib/constants";
import { fmtMeetLabel, fromLocalInput, toLocalInput } from "@/lib/format";
import { api, HttpError, getHostToken, saveHostToken, saveName } from "@/lib/api";
import { metersBetween } from "@/lib/coords";
import type { ClientMsg, ServerMsg } from "@/types/messages";
import {
  locate,
  meetingFromWire,
  meetingToWire,
  memberFromWire,
  suggestionsFromWire,
} from "@/lib/wire";

import { initialState } from "./engine/types";
import type { Patch, Screen, State, Visibility } from "./engine/types";
import { MapViewController } from "./engine/MapViewController";
import { SheetController } from "./engine/SheetController";
import { renderVals } from "./engine/renderVals";
import type { RoomVals } from "./engine/renderVals";

export type { State } from "./engine/types";

export class RoomEngine {
  state: State = initialState();
  version = 0;
  vpRef: RefObject<HTMLDivElement> = { current: null };
  sheetRef: RefObject<HTMLDivElement> = { current: null };

  private listeners = new Set<() => void>();
  private toastN = 0;
  private clock: ReturnType<typeof setInterval> | null = null;
  // WebSocket 送信関数(RoomContext の useRoomSocket から注入。issue #1)。
  private socketSend: ((msg: ClientMsg) => void) | null = null;
  // 自分が送った meeting_point の echo を 1 回だけ無視するフラグ(自己設定の上書き防止)。
  private ignoreMeetingEcho = false;
  // 位置送信スロットリング(2秒 / 5m。issue #2)。
  private lastPosSentAt = 0;
  private lastSentPos: { lat: number; lng: number } | null = null;
  private geoFirstFix = true; // 最初の測位でビューを現在エリアへ合わせる

  // ── controllers(役割ごとの分割。issue #74)──
  private map = new MapViewController(this, this.vpRef);
  private sheetCtrl = new SheetController(this, this.sheetRef);

  // ── external store glue ──
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  /** 状態のマージ + 購読者通知。renderVals(engine/renderVals.ts)のハンドラからも使う。 */
  setState(patch: Patch, cb?: () => void) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.emit();
    if (cb) cb();
  }

  // ── lifecycle (componentDidMount / WillUnmount 相当) ──
  start() {
    this.clock = setInterval(() => {
      const { expiresAt, screen } = this.state;
      const now = Date.now();
      if (expiresAt && now >= expiresAt) {
        if (screen === "map") {
          this.setState({ now, screen: "ended", sheet: null });
          return;
        }
        if (screen === "join") {
          this.setState({ now, screen: "expired" });
          return;
        }
      }
      this.setState({ now });
    }, 1000);
  }
  stop() {
    if (this.clock) clearInterval(this.clock);
    this.sheetCtrl.dispose();
  }

  // キャンパスマスタを実サーバーから取得し建物データを差し替える(issue #14)。
  // 失敗時は campusData.ts のフォールバック定義を維持する。
  async loadCampus() {
    try {
      const res = await api.getCampus();
      setBuildings(mergeCampus(res));
      this.setState({}); // BUILDINGS 差し替えを描画へ反映
    } catch {
      /* 取得失敗時はローカル定義のまま */
    }
  }

  // サーバー定数を実サーバーから取得し serverConfig を差し替える(有効期限・表示名上限の二重管理解消。issue #15)。
  // 失敗時は constants.ts のフォールバック既定値を維持する。
  async loadConfig() {
    try {
      setServerConfig(await api.getConfig());
      this.setState({}); // 期限・上限表示へ反映
    } catch {
      /* 取得失敗時はフォールバック値のまま */
    }
  }

  // ── toast ──
  toast(msg: string) {
    const id = ++this.toastN;
    this.setState((s) => ({ toasts: [...s.toasts, { id, msg }] }));
    setTimeout(() => this.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  }

  // ── WebSocket 実配線(issue #1)──
  // RoomContext(useRoomSocket)から送信関数を注入/解除する。
  attachSocket(send: ((msg: ClientMsg) => void) | null) {
    this.socketSend = send;
  }
  private send(msg: ClientMsg) {
    this.socketSend?.(msg);
  }
  /** 接続時に送る join(名前・建物・階)。再接続時も useRoomSocket が再送する。 */
  joinMessage(): ClientMsg {
    const s = this.state;
    return {
      type: "join",
      name: s.name.trim() || "あなた",
      building_id: s.joinB || null,
      floor: s.joinF || null,
    };
  }
  /** socket status を再接続バー表示に反映する。 */
  setSocketStatus(status: "connecting" | "open" | "reconnecting" | "closed") {
    const reconnecting = status === "reconnecting";
    if (this.state.reconnecting !== reconnecting) this.setState({ reconnecting });
  }
  private nameOf = (memberId: string): string =>
    this.state.members.find((m) => m.id === memberId)?.name ?? "誰か";

  // サーバー → クライアントの各メッセージを内部状態へ反映する(dev-docs §6)。
  onServerMsg = (msg: ServerMsg) => {
    switch (msg.type) {
      case "room_state":
        this.setState({
          selfId: msg.self_id,
          members: msg.members.map(memberFromWire),
          meeting: meetingFromWire(msg.meeting_point),
          expiresAt: Date.parse(msg.expires_at),
        });
        break;
      case "member_joined": {
        const nm = memberFromWire(msg.member);
        this.setState((s) => ({
          members: s.members.some((m) => m.id === nm.id)
            ? s.members.map((m) => (m.id === nm.id ? nm : m))
            : [...s.members, nm],
        }));
        if (nm.id !== this.state.selfId) this.toast(nm.name + "さんが参加しました");
        break;
      }
      case "member_update": {
        const nm = memberFromWire(msg.member);
        this.setState((s) => ({ members: s.members.map((m) => (m.id === nm.id ? nm : m)) }));
        break;
      }
      case "member_left": {
        const left = this.state.members.find((m) => m.id === msg.id);
        this.setState((s) => ({ members: s.members.filter((m) => m.id !== msg.id) }));
        if (left && left.id !== this.state.selfId) this.toast(left.name + "さんが退出しました");
        if (left) this.keepMeetingOnLeave(left);
        break;
      }
      case "meeting_point":
        // 自分が設定した分は setMeeting で反映済み。その echo は 1 回だけ無視して
        // ローカルの meeting(coords の note など)と meetingBy「あなた」を保持する。
        if (this.ignoreMeetingEcho) {
          this.ignoreMeetingEcho = false;
          break;
        }
        this.setState({
          meeting: meetingFromWire(msg.point),
          meetingBy: msg.point ? "メンバー" : "",
        });
        break;
      case "place_suggestions":
        this.setState({ suggestions: suggestionsFromWire(msg.items, this.nameOf) });
        break;
      case "room_full":
        // 満員で参加拒否。screen が map を外れ、useRoomSocket が切断・再接続しない。
        this.setState({ screen: "full", sheet: null });
        break;
      case "room_expired":
        // 期限切れは終了画面へ。screen が map を外れると useRoomSocket が切断し再接続しない。
        if (this.state.screen === "map") this.setState({ screen: "ended", sheet: null });
        else if (this.state.screen === "join") this.setState({ screen: "expired" });
        break;
    }
  };

  // ── navigation ──
  goTop = () => {
    this.setState({ ...initialState(), publicList: this.state.publicList, now: Date.now() });
  };
  createRoom = () =>
    this.setState({
      createOpen: true,
      newTitle: "",
      newVis: "private",
      newMeetAt: toLocalInput(Date.now()),
    });
  cancelCreate = () => this.setState({ createOpen: false });
  submitCreate = async () => {
    if (this.state.creating) return;
    this.setState({ creating: true });
    const { newTitle, newVis, newMeetAt } = this.state;
    const title = newTitle.trim();
    const meetAtMs = fromLocalInput(newMeetAt);
    try {
      const res = await api.createRoom({
        title: title || undefined,
        visibility: newVis,
        meet_at: new Date(meetAtMs).toISOString(),
      });
      saveHostToken(res.room_id, res.host_token); // 再訪時に host を復元するため端末に保存
      this.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.state.publicList,
        creating: false,
        createOpen: false,
        screen: "join",
        roomId: res.room_id,
        isHost: true,
        roomTitle: title,
        visibility: res.visibility,
        meetAt: Date.parse(res.meet_at),
        expiresAt: Date.parse(res.expires_at),
      });
      if (res.visibility === "public") this.toast("公開ルームとして作成しました");
    } catch {
      this.setState({ creating: false });
      this.toast("ルームを作成できませんでした。通信環境を確認してください");
    }
  };
  setMeetAt = (v: string) => {
    const meetAt = fromLocalInput(v);
    this.setState({ meetAt, expiresAt: meetAt + serverConfig.endOffsetMs });
    this.toast("集合時間を " + fmtMeetLabel(meetAt) + " に変更しました");
  };
  goPublic = () => {
    this.setState({ screen: "public" });
    void this.loadPublicRooms();
  };
  refreshPublic = () => void this.loadPublicRooms({ toast: true });
  // 公開ルーム一覧を実サーバーから取得(issue #13)。
  private async loadPublicRooms(opts?: { toast?: boolean }) {
    this.setState({ refreshing: true });
    try {
      const rooms = await api.getPublicRooms();
      this.setState({
        refreshing: false,
        publicList: rooms.map((r) => ({
          id: r.room_id,
          title: r.title,
          members: r.members,
          exp: Date.parse(r.expires_at),
        })),
      });
      if (opts?.toast) this.toast("一覧を更新しました");
    } catch {
      this.setState({ refreshing: false });
      this.toast("公開ルームを取得できませんでした");
    }
  }
  openPublicRoom(r: DemoRoom) {
    void this.openRoomById(r.id, r.title);
  }
  // 参加前の存在チェック(共有リンク/公開一覧クリック)。404→NotFound / 410→期限切れ(issue #13)。
  openRoomById = async (roomId: string, title = "") => {
    try {
      const res = await api.getRoom(roomId);
      const expiresAt = Date.parse(res.expires_at);
      this.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.state.publicList,
        screen: "join",
        roomId,
        roomTitle: title,
        isHost: getHostToken(roomId) !== null, // 作成した端末なら host を復元
        visibility: res.visibility, // 公開範囲をサーバー実値から復元(public→退出→再参加で private に戻る不具合。issue #35)
        meetAt: expiresAt - serverConfig.endOffsetMs,
        expiresAt,
      });
    } catch (e) {
      // 404→NotFound / 410→期限切れ。それ以外(通信エラー・5xx 等)は"存在しない"と
      // 誤認させないよう、再試行できるトップへ戻してトーストで知らせる(issue #13 レビュー対応)。
      const status = e instanceof HttpError ? e.status : 0;
      const screen: Screen = status === 410 ? "expired" : status === 404 ? "notfound" : "top";
      this.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.state.publicList,
        screen,
        roomId,
      });
      if (screen === "top")
        this.toast("接続できませんでした。通信環境を確認して、もう一度お試しください");
    }
  };

  // ── join ──
  tapJoin = () => {
    const n = this.state.name.trim();
    if (!n || n.length > serverConfig.maxNameLength) return;
    this.setState({ permModal: true });
  };
  enterRoom(viewerOnly: boolean) {
    const s = this.state;
    const n = s.name.trim();
    if (n) saveName(n); // 参加時に表示名を保存し、次回の初期値にする(issue #22)
    // 位置送信スロットリング・初回測位フラグをリセット(issue #2)。
    this.lastPosSentAt = 0;
    this.lastSentPos = null;
    this.geoFirstFix = true;
    // 参加者は WebSocket 接続後の room_state 受信で初期化する(issue #1)。
    // screen を map にすると RoomContext(useRoomSocket)が接続し、join を送信する。
    this.setState(
      {
        permModal: false,
        viewerOnly,
        screen: "map",
        members: [],
        selfId: "",
        area: "campus",
        selfB: s.joinB,
        selfF: s.joinF,
      },
      () => {
        requestAnimationFrame(() => this.fitArea());
      }
    );
    this.toast(s.isHost ? "ルームを作成しました。「共有」からURLを送りましょう" : "参加しました");
    if (viewerOnly) this.toast("閲覧のみで参加しています");
  }
  // 参加中(map)の再共有は enterRoom で作り直さず viewerOnly を切り替えるだけ(issue #2)。
  permAllow = () => {
    if (this.state.screen === "map") this.setState({ permModal: false, viewerOnly: false });
    else this.enterRoom(false);
  };
  permDeny = () => {
    if (this.state.screen === "map") this.setState({ permModal: false, viewerOnly: true });
    else this.enterRoom(true);
  };
  joinViewer = () => {
    if (!this.state.name.trim()) {
      this.toast("表示名を入力してください");
      return;
    }
    this.enterRoom(true);
  };
  sharePosAgain = () => this.setState({ permModal: true });

  // ── geolocation(issue #2)──
  // RoomContext(useGeolocation)から実測位置を受け取る。自分ピンを即時反映し、送信は throttle する。
  onGeoPosition = (lat: number, lng: number, accuracy: number) => {
    const loc = locate(lat, lng);
    this.setState((s) => ({
      members: s.members.map((m) =>
        m.id === s.selfId
          ? { ...m, area: loc.area, x: loc.x, y: loc.y, lost: loc.lost, viewer: false, lat, lng }
          : m
      ),
    }));
    // 最初の測位でビューを現在エリアへ合わせる(現在エリアの自動選択)。
    if (this.geoFirstFix && !loc.lost) {
      this.geoFirstFix = false;
      if (loc.area !== this.state.area) this.setState({ area: loc.area }, () => this.fitArea());
    }
    // throttle:初回は即送信、以降は 2秒 かつ 前回送信位置から 5m 以上動いたら送る(docs/02 §2)。
    const now = Date.now();
    const first = this.lastSentPos === null;
    const movedEnough =
      !first && metersBetween(this.lastSentPos!, { lat, lng }) >= POSITION_MIN_MOVE_M;
    if (first || (now - this.lastPosSentAt >= POSITION_THROTTLE_MS && movedEnough)) {
      this.send({ type: "position", lat, lng, accuracy });
      this.lastPosSentAt = now;
      this.lastSentPos = { lat, lng };
    }
  };
  // 許可拒否/非対応 → 閲覧のみモードへフォールバック。
  onGeoDenied = (unsupported: boolean) => {
    if (this.state.viewerOnly) return;
    this.setState({ viewerOnly: true });
    this.toast(
      unsupported
        ? "この端末では位置情報を取得できません。閲覧のみで表示します"
        : "位置情報が許可されなかったため、閲覧のみで表示します"
    );
  };

  // ── map view(MapViewController へ委譲)──
  fitArea = this.map.fitArea;
  centerOn = this.map.centerOn;
  pickArea = this.map.pickArea;
  onMapDown = this.map.onMapDown;
  onMapMove = this.map.onMapMove;
  onMapUp = this.map.onMapUp;
  onMapCancel = this.map.onMapCancel;
  onMapWheel = this.map.onMapWheel;
  fabZoomIn = this.map.fabZoomIn;
  fabZoomOut = this.map.fabZoomOut;
  fabSelf = this.map.fabSelf;
  fabFit = this.map.fabFit;

  startPick = () => this.setState({ pickMode: true, sheet: null });
  cancelPick = () => this.setState({ pickMode: false });
  cancelPin = () => this.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  confirmPin = () => {
    const p = this.state.pendingPin;
    if (!p) return;
    this.setMeeting(
      { kind: "coords", area: p.area, x: p.x, y: p.y, note: this.state.pinNote.trim() },
      "あなた"
    );
    this.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  };
  // ── sheets(SheetController へ委譲)──
  closeSheet = this.sheetCtrl.closeSheet;
  hDown = this.sheetCtrl.hDown;
  hMove = this.sheetCtrl.hMove;
  hUp = this.sheetCtrl.hUp;
  hCancel = this.sheetCtrl.hCancel;
  openMembers = this.sheetCtrl.openMembers;
  openMeeting = this.sheetCtrl.openMeeting;
  openPlaces = this.sheetCtrl.openPlaces;
  openShare = this.sheetCtrl.openShare;
  openSettings = this.sheetCtrl.openSettings;
  openBuilding = this.sheetCtrl.openBuilding;

  // ── building panel ──
  pickBuilding(id: string) {
    this.setState({ selB: id, selRoom: null });
  }
  toggleFloor(key: string) {
    this.setState((s) => ({ openFloors: { ...s.openFloors, [key]: !s.openFloors[key] } }));
  }
  setSelfFloor(b: string, f: string) {
    this.setState((s) => ({
      selfB: b,
      selfF: f,
      members: s.members.map((m) =>
        m.id === s.selfId ? { ...m, building: b || null, floor: f || null } : m
      ),
    }));
    this.send({ type: "floor", building_id: b || null, floor: f || null });
    const bn = b ? bById(b)!.name : null;
    this.toast(
      bn ? "自分の場所を「" + bn + " " + f + "」にしました" : "自分の場所を屋外にしました"
    );
  }
  pickRoom(rid: string) {
    this.setState((s) => ({ selRoom: s.selRoom === rid ? null : rid }));
  }
  roomMeet = () => {
    const rid = this.state.selRoom;
    if (!rid) return;
    this.setMeeting({ kind: "place", type: "classroom", ref: rid }, "あなた");
    this.setState({ selRoom: null, sheet: null });
  };
  roomSuggest = () => {
    const rid = this.state.selRoom;
    if (!rid) return;
    if (this.state.suggestions.some((x) => x.ref === rid)) {
      this.toast("すでに候補に追加されています");
      return;
    }
    this.setState((s) => ({
      suggestions: [
        ...s.suggestions,
        { id: "sg" + Date.now(), kind: "room", ref: rid, note: "", by: "あなた" },
      ],
      selRoom: null,
    }));
    this.send({
      type: "add_place_suggestion",
      place: { type: "classroom", roomId: rid },
      note: "",
    });
    this.toast("空き教室の候補に追加しました");
  };
  spotMeet = () => {
    this.setMeeting({ kind: "place", type: "spot", ref: this.state.selB }, "あなた");
    this.setState({ sheet: null });
  };

  // ── meeting point ──
  setMeeting(point: MeetingPoint, by: string) {
    this.setState({ meeting: point, meetingBy: by });
    if (this.socketSend) this.ignoreMeetingEcho = true; // 接続時のみ echo が返る
    this.send({ type: "meeting_point", point: meetingToWire(point) });
    this.toast("集合場所を設定しました:" + this.meetingLabelOf(point));
  }
  clearMeeting = () => {
    this.setState({ meeting: null });
    if (this.socketSend) this.ignoreMeetingEcho = true;
    this.send({ type: "meeting_point", point: null });
    this.toast("集合場所を解除しました");
  };
  // 集合先(member 追従)の相手が退出しても集合場所を失わないようにする(issue #37 案B)。
  // 最後の位置が分かる場合は coords に固定し、位置未共有・全エリア外は固定できないため解除する。
  // サーバーの meeting_point が member のまま残ると再参加・途中参加で集合先が消えるため、
  // 残メンバーのうち id 最小のクライアントが代表して固定結果を送信する(重複送信の回避)。
  // note はワイヤ(coords は lat/lng のみ)に乗らないため、代表送信の echo を受けた非代表端末では
  // 汎用ラベル(「◯◯の地点」)に落ちる(pin-drop の note と同じ既存制約。ピン位置・距離は維持される)。
  private keepMeetingOnLeave(left: Member) {
    const mt = this.state.meeting;
    if (!mt || mt.kind !== "member" || mt.memberId !== left.id) return;
    const fixed: MeetingPoint | null =
      left.viewer || left.lost
        ? null
        : {
            kind: "coords",
            area: left.area,
            x: left.x,
            y: left.y,
            note: left.name + "さんが最後にいた場所",
          };
    this.setState({ meeting: fixed });
    this.toast(
      fixed
        ? "集合場所を" + left.name + "さんが最後にいた場所に固定しました"
        : "集合先の" + left.name + "さんの位置が分からないため、集合場所を解除しました"
    );
    const leaderId = this.state.members.map((m) => m.id).sort()[0];
    if (!leaderId || leaderId !== this.state.selfId) return;
    if (this.socketSend) this.ignoreMeetingEcho = true;
    this.send({ type: "meeting_point", point: meetingToWire(fixed) });
  }
  meetingLabelOf(pt: MeetingPoint | null): string {
    if (!pt) return "";
    if (pt.kind === "coords") return pt.note ? pt.note : AREAS[pt.area].short + "の地点";
    if (pt.kind === "member") {
      const m = this.state.members.find((x) => x.id === pt.memberId);
      return (m ? m.name : "?") + "さんのところ";
    }
    if (pt.type === "spot") return bById(pt.ref)!.name + "前";
    return roomFull(pt.ref);
  }
  resolveMeetingPos(): { area: AreaId; x: number; y: number } | null {
    const pt = this.state.meeting;
    if (!pt) return null;
    if (pt.kind === "coords") return { area: pt.area, x: pt.x, y: pt.y };
    if (pt.kind === "member") {
      const m = this.state.members.find((x) => x.id === pt.memberId);
      if (!m || m.lost || m.viewer) return null;
      return { area: m.area, x: m.x, y: m.y };
    }
    if (pt.type === "spot") {
      const b = bById(pt.ref)!;
      const p = bSpot(b);
      return { area: "campus", x: p.x, y: p.y };
    }
    const hit = roomLookup(pt.ref);
    if (!hit) return null;
    const p = bAnchor(hit.b);
    return { area: "campus", x: p.x, y: p.y };
  }
  mtPickMember = () => this.setState({ mtKind: "member" });
  mtPickPlace = () => this.setState({ mtKind: "place" });
  mtApply = () => {
    const s = this.state;
    if (s.mtKind === "member") {
      if (!s.mtMember) return;
      this.setMeeting({ kind: "member", memberId: s.mtMember }, "あなた");
      this.setState({ sheet: null });
      return;
    }
    if (!s.placeR) return;
    if (s.placeR.startsWith("spot:"))
      this.setMeeting({ kind: "place", type: "spot", ref: s.placeR.slice(5) }, "あなた");
    else this.setMeeting({ kind: "place", type: "classroom", ref: s.placeR.slice(5) }, "あなた");
    this.setState({ sheet: null });
  };
  adoptSuggestion(sg: PlaceSuggestion) {
    this.setMeeting({ kind: "place", type: "classroom", ref: sg.ref }, "あなた");
    this.setState({ sheet: null });
  }
  toggleAdd = () =>
    this.setState((s) => {
      const b = bById(s.addB) || BUILDINGS[0];
      return { addOpen: !s.addOpen, addF: b.floors[0].level, addRs: [], addNote: "" };
    });
  submitAdd = () => {
    const s = this.state;
    if (!s.addRs.length) {
      this.toast("教室を選択してください");
      return;
    }
    const existing = new Set(s.suggestions.map((x) => x.ref));
    const fresh = s.addRs.filter((rid) => !existing.has(rid));
    if (!fresh.length) {
      this.toast("選択した教室はすべて追加済みです");
      return;
    }
    const note = s.addNote.trim();
    const now = Date.now();
    const added: PlaceSuggestion[] = fresh.map((rid, i) => ({
      id: "sg" + (now + i),
      kind: "room",
      ref: rid,
      note,
      by: "あなた",
    }));
    const dupN = s.addRs.length - fresh.length;
    this.setState({
      suggestions: [...s.suggestions, ...added],
      addOpen: false,
      addNote: "",
      addRs: [],
    });
    fresh.forEach((rid) =>
      this.send({ type: "add_place_suggestion", place: { type: "classroom", roomId: rid }, note })
    );
    this.toast(
      fresh.length + "件の空き教室を追加しました" + (dupN ? "(" + dupN + "件は追加済み)" : "")
    );
  };

  // ── settings ──
  shareUrl() {
    // 実オリジンから生成(ハードコードの imasoko.app だと共有/再参加リンクが実環境で機能しない・issue #21)。
    return location.origin + "/r/" + this.state.roomId;
  }
  copyLink = () => {
    const url = this.shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.toast("リンクをコピーしました"),
        () => this.toast("コピーできませんでした。URLを長押しで選択してください")
      );
    } else this.toast("コピーできませんでした。URLを長押しで選択してください");
  };
  webShare = () => {
    const url = this.shareUrl();
    if (navigator.share)
      navigator
        .share({ title: "いまそこ", text: "集合ルームに参加してください", url })
        .catch(() => {});
    else {
      this.copyLink();
      this.toast("この環境では共有シートが使えないためコピーしました");
    }
  };
  pickPrivate = () => {
    if (this.state.visibility === "private") return;
    void this.applyVisibility("private", "ルームを非公開にしました");
  };
  pickPublic = () => {
    if (this.state.visibility === "public") return;
    this.setState({ warnPublic: true });
  };
  confirmPublic = () => {
    this.setState({ warnPublic: false });
    void this.applyVisibility("public", "ルームを公開しました。一覧に表示されます");
  };
  cancelPublic = () => this.setState({ warnPublic: false });
  // 公開範囲を実サーバーへ反映(x-host-token)。403=権限なし、失敗時は楽観更新を戻す(issue #13)。
  private async applyVisibility(visibility: Visibility, successMsg: string) {
    const token = getHostToken(this.state.roomId);
    if (!token) {
      this.toast("公開範囲を変更できるのはホストのみです");
      return;
    }
    const prev = this.state.visibility;
    this.setState({ visibility }); // 楽観更新
    try {
      await api.patchVisibility(
        this.state.roomId,
        token,
        visibility,
        this.state.roomTitle.trim() || undefined
      );
      this.toast(successMsg);
    } catch (e) {
      this.setState({ visibility: prev }); // 失敗したら元に戻す
      this.toast(
        e instanceof HttpError && e.status === 403
          ? "権限がありません(ホストのみ変更できます)"
          : "公開範囲を変更できませんでした"
      );
    }
  }
  tapLeave = () => this.setState({ leaveOpen: true });
  cancelLeave = () => this.setState({ leaveOpen: false });
  doLeave = () => {
    this.send({ type: "leave" });
    this.toast("退出しました");
    this.goTop();
  };
  // ── render helpers ──
  // 派生値の計算は engine/renderVals.ts に切り出し(プロトタイプと同名。issue #74)。
  renderVals(): RoomVals {
    return renderVals(this);
  }
}

export type { RoomVals } from "./engine/renderVals";
