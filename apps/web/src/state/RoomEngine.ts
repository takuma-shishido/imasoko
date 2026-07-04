// プロトタイプ(いまそこ Prototype.dc.html)の `Component extends DCLogic` を、
// フレームワーク非依存の状態機械クラスとして 1:1 移植したもの。
// this.setState → 内部マージ + 購読者通知、React.createRef → 素の ref オブジェクトに置換。
// 派生値は renderVals()(プロトタイプと同名)で計算する。

import type { ChangeEvent, MouseEvent, PointerEvent, RefObject, WheelEvent } from "react";
import type {
  AreaId,
  Building,
  DemoRoom,
  MeetingPoint,
  Member,
  PlaceSuggestion,
  Room,
  Toast,
} from "@/types/campus";
import { AREAS, AREA_ORDER } from "@/lib/mapAreas";
import {
  BUILDINGS,
  CLAMP,
  MAP_TEXTS,
  bAnchor,
  bById,
  bSpot,
  mergeCampus,
  roomFull,
  roomLookup,
  setBuildings,
} from "@/lib/campusData";
import { END_OFFSET, POSITION_MIN_MOVE_M, POSITION_THROTTLE_MS } from "@/lib/constants";
import { fmtLong, fmtMeetLabel, fmtShort, fromLocalInput, toLocalInput } from "@/lib/format";
import { api, HttpError, getHostToken, getName, saveHostToken, saveName } from "@/lib/api";
import { metersBetween } from "@/lib/coords";
import type { ClientMsg, ServerMsg } from "@/types/messages";
import {
  locate,
  meetingFromWire,
  meetingToWire,
  memberFromWire,
  suggestionsFromWire,
} from "@/lib/wire";

type Screen = "top" | "public" | "join" | "map" | "expired" | "ended" | "notfound" | "full";
type SheetName = "members" | "building" | "meeting" | "share" | "settings";
type Visibility = "private" | "public";

interface View {
  tx: number;
  ty: number;
  k: number;
}
interface PendingPin {
  area: AreaId;
  x: number;
  y: number;
}
export interface State {
  screen: Screen;
  creating: boolean;
  refreshing: boolean;
  createOpen: boolean;
  newTitle: string;
  newVis: Visibility;
  newMeetAt: string;
  meetAt: number;
  roomId: string;
  roomTitle: string;
  visibility: Visibility;
  isHost: boolean;
  /** 自分の member_id(room_state の self_id。未参加時は空。issue #1)。 */
  selfId: string;
  /** 公開ルーム一覧(実サーバー /api/rooms/public 由来。issue #13)。 */
  publicList: DemoRoom[];
  name: string;
  joinB: string;
  joinF: string;
  permModal: boolean;
  viewerOnly: boolean;
  area: AreaId;
  view: View;
  sheet: SheetName | null;
  selB: string;
  openFloors: Record<string, boolean>;
  selRoom: string | null;
  meeting: MeetingPoint | null;
  meetingBy: string;
  pickMode: boolean;
  pinModal: boolean;
  pendingPin: PendingPin | null;
  pinNote: string;
  mtKind: "member" | "place";
  mtMember: string | null;
  placeB: string;
  placeR: string;
  suggestions: PlaceSuggestion[];
  addOpen: boolean;
  addB: string;
  addF: string;
  addRs: string[];
  addNote: string;
  expiresAt: number;
  now: number;
  reconnecting: boolean;
  connFail: boolean;
  demoOpen: boolean;
  toasts: Toast[];
  warnPublic: boolean;
  leaveOpen: boolean;
  members: Member[];
  yutaLost: boolean;
  selfB?: string;
  selfF?: string;
}

type Patch = Partial<State> | ((s: State) => Partial<State>);

export class RoomEngine {
  state: State;
  version = 0;
  vpRef: RefObject<HTMLDivElement> = { current: null };
  sheetRef: RefObject<HTMLDivElement> = { current: null };

  private listeners = new Set<() => void>();
  private drag: { sx: number; sy: number; tx: number; ty: number; moved: boolean } | null = null;
  private sheetDrag: { sy: number; dy?: number } | null = null;
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

  constructor() {
    this.state = this.initialState();
  }

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
  private setState(patch: Patch, cb?: () => void) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.emit();
    if (cb) cb();
  }

  initialState(): State {
    const now = Date.now();
    return {
      screen: "top",
      creating: false,
      refreshing: false,
      createOpen: false,
      newTitle: "",
      newVis: "private",
      newMeetAt: "",
      meetAt: 0,
      roomId: "k7m2pq",
      roomTitle: "",
      visibility: "private",
      isHost: true,
      selfId: "",
      publicList: [],
      name: getName(), // 前回入力した表示名を初期値に(issue #22)
      joinB: "",
      joinF: "",
      permModal: false,
      viewerOnly: false,
      area: "campus",
      view: { tx: 0, ty: 0, k: 0.5 },
      sheet: null,
      selB: "b1",
      openFloors: {},
      selRoom: null,
      meeting: null,
      meetingBy: "",
      pickMode: false,
      pinModal: false,
      pendingPin: null,
      pinNote: "",
      mtKind: "member",
      mtMember: null,
      placeB: "b1",
      placeR: "",
      suggestions: [],
      addOpen: false,
      addB: "b1",
      addF: "",
      addRs: [],
      addNote: "",
      expiresAt: 0,
      now,
      reconnecting: false,
      connFail: false,
      demoOpen: false,
      toasts: [],
      warnPublic: false,
      leaveOpen: false,
      members: [],
      yutaLost: false,
    };
  }

  // ── lifecycle (componentDidMount / WillUnmount 相当) ──
  start() {
    this.clock = setInterval(() => {
      const { expiresAt, screen } = this.state;
      const now = Date.now();
      if (expiresAt && now >= expiresAt) {
        if (screen === "map") {
          this.setState({ now, screen: "ended", sheet: null, demoOpen: false });
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
        this.setState({ screen: "full", sheet: null, demoOpen: false });
        break;
      case "room_expired":
        // 期限切れは終了画面へ。screen が map を外れると useRoomSocket が切断し再接続しない。
        if (this.state.screen === "map")
          this.setState({ screen: "ended", sheet: null, demoOpen: false });
        else if (this.state.screen === "join") this.setState({ screen: "expired" });
        break;
    }
  };

  // ── navigation ──
  goTop = () => {
    this.setState({ ...this.initialState(), publicList: this.state.publicList, now: Date.now() });
  };
  createRoom = () =>
    this.setState({
      createOpen: true,
      newTitle: "",
      newVis: "private",
      newMeetAt: toLocalInput(Date.now()),
      demoOpen: false,
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
        ...this.initialState(),
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
    this.setState({ meetAt, expiresAt: meetAt + END_OFFSET });
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
        ...this.initialState(),
        now: Date.now(),
        publicList: this.state.publicList,
        screen: "join",
        roomId,
        roomTitle: title,
        isHost: getHostToken(roomId) !== null, // 作成した端末なら host を復元
        meetAt: expiresAt - END_OFFSET,
        expiresAt,
      });
    } catch (e) {
      // 404→NotFound / 410→期限切れ。それ以外(通信エラー・5xx 等)は"存在しない"と
      // 誤認させないよう、再試行できるトップへ戻してトーストで知らせる(issue #13 レビュー対応)。
      const status = e instanceof HttpError ? e.status : 0;
      const screen: Screen = status === 410 ? "expired" : status === 404 ? "notfound" : "top";
      this.setState({
        ...this.initialState(),
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
    if (!n || n.length > 20) return;
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
          ? { ...m, area: loc.area, x: loc.x, y: loc.y, lost: loc.lost, viewer: false }
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

  // ── map view ──
  fitArea() {
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const A = AREAS[this.state.area];
    const k = Math.min(r.width / A.w, r.height / A.h) * 0.98;
    this.setState({ view: { k, tx: (r.width - A.w * k) / 2, ty: (r.height - A.h * k) / 2 } });
  }
  centerOn(x: number, y: number, k?: number) {
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const kk = k || Math.max(this.state.view.k, 1);
    this.setState({ view: { k: kk, tx: r.width / 2 - x * kk, ty: r.height / 2 - y * kk } });
  }
  pickArea(id: AreaId) {
    if (id === this.state.area) return;
    this.setState({ area: id }, () => this.fitArea());
  }
  onMapDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest && (e.target as HTMLElement).closest("[data-nopan]"))
      return;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    this.drag = {
      sx: e.clientX,
      sy: e.clientY,
      tx: this.state.view.tx,
      ty: this.state.view.ty,
      moved: false,
    };
  };
  onMapMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
    if (this.drag.moved)
      this.setState({ view: { ...this.state.view, tx: this.drag.tx + dx, ty: this.drag.ty + dy } });
  };
  onMapUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = this.drag;
    this.drag = null;
    if (!this.state.pickMode || !d || d.moved) return;
    if ((e.target as HTMLElement).closest && (e.target as HTMLElement).closest("[data-nopan]"))
      return;
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.state.view;
    const wx = (e.clientX - r.left - tx) / k;
    const wy = (e.clientY - r.top - ty) / k;
    const A = AREAS[this.state.area];
    if (wx < 0 || wy < 0 || wx > A.w || wy > A.h) return;
    this.setState({
      pickMode: false,
      pinModal: true,
      pendingPin: { area: this.state.area, x: wx, y: wy },
      pinNote: "",
    });
  };
  startPick = () => this.setState({ pickMode: true, sheet: null, demoOpen: false });
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
  onMapWheel = (e: WheelEvent<HTMLDivElement>) => {
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.state.view;
    const A = AREAS[this.state.area];
    const fit = Math.min(r.width / A.w, r.height / A.h);
    const nk = Math.min(3.5, Math.max(fit * 0.7, k * Math.exp(-e.deltaY * 0.0016)));
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    this.setState({
      view: { k: nk, tx: cx - ((cx - tx) / k) * nk, ty: cy - ((cy - ty) / k) * nk },
    });
  };
  private zoomBy(f: number) {
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.state.view;
    const A = AREAS[this.state.area];
    const fit = Math.min(r.width / A.w, r.height / A.h);
    const nk = Math.min(3.5, Math.max(fit * 0.7, k * f));
    const cx = r.width / 2;
    const cy = r.height / 2;
    this.setState({
      view: { k: nk, tx: cx - ((cx - tx) / k) * nk, ty: cy - ((cy - ty) / k) * nk },
    });
  }
  fabZoomIn = () => this.zoomBy(1.35);
  fabZoomOut = () => this.zoomBy(1 / 1.35);
  fabSelf = () => {
    const self = this.state.members.find((m) => m.id === this.state.selfId);
    if (!self || self.viewer) {
      this.toast("位置情報を共有していません");
      return;
    }
    if (self.area !== this.state.area) {
      this.setState({ area: self.area }, () => this.centerOn(self.x, self.y, 1.2));
      return;
    }
    this.centerOn(self.x, self.y, Math.max(this.state.view.k, 1.2));
  };
  fabFit = () => {
    const pts = this.state.members.filter(
      (m) => !m.lost && !m.viewer && m.area === this.state.area
    );
    if (!pts.length) {
      this.fitArea();
      return;
    }
    const vp = this.vpRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const x0 = Math.min(...pts.map((p) => p.x)) - 70;
    const x1 = Math.max(...pts.map((p) => p.x)) + 70;
    const y0 = Math.min(...pts.map((p) => p.y)) - 90;
    const y1 = Math.max(...pts.map((p) => p.y)) + 60;
    const k = Math.min(3, Math.min(r.width / (x1 - x0), r.height / (y1 - y0)));
    this.setState({
      view: { k, tx: r.width / 2 - ((x0 + x1) / 2) * k, ty: r.height / 2 - ((y0 + y1) / 2) * k },
    });
  };

  // ── sheets ──
  private openSheet(name: SheetName) {
    this.setState({ sheet: name, demoOpen: false });
  }
  closeSheet = () => this.setState({ sheet: null, selRoom: null, addOpen: false });
  hDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    this.sheetDrag = { sy: e.clientY };
  };
  hMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!this.sheetDrag) return;
    const dy = Math.max(0, e.clientY - this.sheetDrag.sy);
    this.sheetDrag.dy = dy;
    if (this.sheetRef.current) this.sheetRef.current.style.transform = "translateY(" + dy + "px)";
  };
  hUp = () => {
    const d = this.sheetDrag;
    this.sheetDrag = null;
    if (this.sheetRef.current) this.sheetRef.current.style.transform = "";
    if (d && d.dy && d.dy > 70) this.closeSheet();
  };
  openMembers = () => this.openSheet("members");
  openMeeting = () => this.openSheet("meeting");
  openPlaces = () => this.openSheet("meeting");
  openShare = () => this.openSheet("share");
  openSettings = () => this.openSheet("settings");
  openBuilding = () => {
    if (this.state.area !== "campus") {
      this.toast("建物はキャンパスエリアで利用できます");
      return;
    }
    this.openSheet("building");
  };

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
    return "https://imasoko.app/r/" + this.state.roomId;
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
  tapLeave = () => this.setState({ leaveOpen: true, demoOpen: false });
  cancelLeave = () => this.setState({ leaveOpen: false });
  doLeave = () => {
    this.send({ type: "leave" });
    this.toast("退出しました");
    this.goTop();
  };
  retryConn = () => {
    this.setState({ connFail: false, reconnecting: true });
    setTimeout(() => {
      this.setState({ reconnecting: false });
      this.toast("再接続しました");
    }, 1800);
  };

  // ── demo controls ──
  toggleDemo = () => this.setState((s) => ({ demoOpen: !s.demoOpen }));
  demoList(): { label: string; run: () => void }[] {
    const inRoom = this.state.screen === "map";
    const needRoom = (fn: () => void) => () => {
      this.setState({ demoOpen: false });
      if (!inRoom) {
        this.toast("ルーム参加中のみ使えるデモです");
        return;
      }
      fn();
    };
    return [
      {
        label: "⏱ 残り時間を15秒にする",
        run: needRoom(() => this.setState({ expiresAt: Date.now() + 15000 })),
      },
      {
        label: "⏹ ルームを即終了(room_expired)",
        run: needRoom(() => {
          this.setState({ screen: "ended", sheet: null });
        }),
      },
      {
        label: "〰 再接続中バーを表示/解除",
        run: needRoom(() => this.setState((s) => ({ reconnecting: !s.reconnecting }))),
      },
      { label: "✕ 接続失敗(継続)を表示", run: needRoom(() => this.setState({ connFail: true })) },
      {
        label: "👁 閲覧のみ ⇔ 位置共有 を切替",
        run: needRoom(() =>
          this.setState((s) => ({
            viewerOnly: !s.viewerOnly,
            members: s.members.map((m) =>
              m.id === s.selfId ? { ...m, viewer: !s.viewerOnly } : m
            ),
          }))
        ),
      },
      {
        label: "📵 ゆうたを全エリア範囲外に/戻す",
        run: needRoom(() => {
          const lost = !this.state.yutaLost;
          this.setState((s) => ({
            yutaLost: lost,
            members: s.members.map((m) => (m.id === "yuta" ? { ...m, lost } : m)),
          }));
        }),
      },
      {
        label: "🈵 満員エラー画面",
        run: () => {
          this.setState({ screen: "full", sheet: null, demoOpen: false });
        },
      },
      {
        label: "⌛ 期限切れ画面(410 Gone)",
        run: () => {
          this.setState({ screen: "expired", sheet: null, demoOpen: false });
        },
      },
      {
        label: "❓ Not Found 画面(404)",
        run: () => {
          this.setState({ screen: "notfound", sheet: null, demoOpen: false });
        },
      },
      { label: "↺ 最初からやり直す", run: () => this.goTop() },
    ];
  }

  // ── render helpers ──
  private clampedPos(m: Member, idxMap: Record<string, number>) {
    const cur = this.state.area;
    const A = AREAS[cur];
    if (m.lost) {
      const [x, y] = CLAMP[cur].lost;
      const i = idxMap.lost++;
      return { x: x + i * 44, y, out: true };
    }
    if (m.area !== cur) {
      const c = CLAMP[cur][m.area] || [30, A.h / 2];
      const i = (idxMap[m.area] = (idxMap[m.area] || 0) + 1);
      return { x: c[0], y: c[1] + (i - 1) * 42, out: true };
    }
    return {
      x: Math.min(Math.max(m.x, 16), A.w - 16),
      y: Math.min(Math.max(m.y, 30), A.h - 10),
      out: false,
    };
  }
  private locLabel(m: Member): string {
    if (m.viewer) return "閲覧のみ・位置非共有";
    if (m.lost) return "範囲外(全エリア外)";
    const areaN = AREAS[m.area].name;
    if (m.building) return bById(m.building)!.name + " " + m.floor + " ・ " + areaN;
    return areaN;
  }
  private distTo(m: Member, mp: { area: AreaId; x: number; y: number } | null): string {
    if (!mp || m.viewer || m.lost) return "—";
    if (m.area !== mp.area) return "別エリア";
    const d = Math.hypot(m.x - mp.x, m.y - mp.y) * AREAS[m.area].mpp;
    return "約" + Math.max(10, Math.round(d / 10) * 10) + "m";
  }

  renderVals() {
    const s = this.state;
    const remaining = s.expiresAt ? Math.max(0, s.expiresAt - s.now) : 0;
    const mp = this.resolveMeetingPos();
    const A = AREAS[s.area];
    const invScale = Math.min(2.6, Math.max(0.85, 1 / s.view.k)).toFixed(3);

    // pins
    const meetTargetId = s.meeting && s.meeting.kind === "member" ? s.meeting.memberId : null;
    const idxMap: Record<string, number> = { lost: 0 };
    const pinList = [];
    for (const m of s.members) {
      if (m.viewer) continue;
      const pos = this.clampedPos(m, idxMap);
      const self = m.id === s.selfId;
      const isMeet = m.id === meetTargetId && !pos.out;
      const floorTag = m.building
        ? " ・ " + bById(m.building)!.name.replace("号館", "") + "号館" + m.floor
        : "";
      pinList.push({
        x: pos.x.toFixed(1),
        y: pos.y.toFixed(1),
        label: pos.out
          ? m.name + " ・ 範囲外"
          : isMeet
            ? "集合 ・ " + m.name + (self ? "(自分)" : "")
            : self
              ? m.name + "(自分)"
              : m.name + floorTag,
        chipBg: pos.out ? "#f5f5f5" : isMeet ? "#0070f3" : self ? "#171717" : "#ffffff",
        chipFg: pos.out ? "#888888" : isMeet ? "#ffffff" : self ? "#ffffff" : "#171717",
        chipBd: pos.out ? "#e0e0e0" : isMeet ? "#0070f3" : self ? "#171717" : "#ebebeb",
        dotBg: pos.out ? "#bdbdbd" : isMeet ? "#0070f3" : self ? "#171717" : "#ffffff",
        dotBd: pos.out ? "#f5f5f5" : isMeet ? "#ffffff" : self ? "#ffffff" : "#171717",
        anim: self && !pos.out ? "ims-pulse 2.2s infinite" : "none",
      });
    }

    // meeting pin(member追従型は対象メンバーのピン自体を青くするため描画しない)
    let meetingPinOn = false;
    let meetingPinX = "0";
    let meetingPinY = "0";
    if (mp && !meetTargetId && mp.area === s.area && s.screen === "map") {
      meetingPinOn = true;
      meetingPinX = mp.x.toFixed(1);
      meetingPinY = mp.y.toFixed(1);
    }

    // member rows
    const selfM = s.members.find((m) => m.id === s.selfId);
    const memberRows = s.members.map((m) => ({
      id: m.id,
      initial: (m.name || "?")[0],
      avBg: m.id === s.selfId ? "#171717" : "#ffffff",
      avFg: m.id === s.selfId ? "#ffffff" : "#171717",
      avBd: m.id === s.selfId ? "#171717" : "#a1a1a1",
      name: m.name,
      tag: m.id === s.selfId ? (s.isHost ? "あなた ・ host" : "あなた") : "",
      loc: this.locLabel(m),
      dist: this.distTo(m, mp),
      focus: () => {
        if (m.viewer) {
          this.toast("位置を共有していないメンバーです");
          return;
        }
        this.setState({ sheet: null });
        if (m.lost) {
          this.toast(m.name + "さんは範囲外です");
          return;
        }
        if (m.area !== s.area) this.setState({ area: m.area }, () => this.centerOn(m.x, m.y, 1.2));
        else this.centerOn(m.x, m.y, Math.max(s.view.k, 1.2));
      },
    }));

    // area summary
    const counts: Record<string, number> = {};
    let lostN = 0;
    for (const m of s.members) {
      if (m.viewer) continue;
      if (m.lost) {
        lostN++;
        continue;
      }
      counts[m.area] = (counts[m.area] || 0) + 1;
    }
    const sumParts = Object.keys(counts).map((k) => AREAS[k as AreaId].short + " " + counts[k]);
    if (lostN) sumParts.push("範囲外 " + lostN);
    const viewers = s.members.filter((m) => m.viewer).length;
    if (viewers) sumParts.push("閲覧 " + viewers);

    // buildings(データ定義 → コンポーネント描画)
    const selB = bById(s.selB) || BUILDINGS[0];
    const campusBuildings = BUILDINGS.map((b: Building) => {
      const active = s.sheet === "building" && s.selB === b.id;
      return {
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        name: b.name,
        cap: b.cap || "",
        fs: b.fs || 19,
        bd: active ? "#171717" : "#a1a1a1",
        bw: active ? 3 : 1.5,
        pick: (e: MouseEvent) => {
          e.stopPropagation();
          this.setState({ selB: b.id, sheet: "building" });
        },
      };
    });
    const mapTexts = (MAP_TEXTS[s.area] || []).map((t) => ({
      x: t.x,
      y: t.y,
      t: t.t,
      size: t.size,
      c: t.c,
      w: t.w || 400,
      ff: t.mono ? "'Geist Mono',monospace" : "inherit",
      ls: t.mono ? ".05em" : "0",
      tf:
        t.a === "l"
          ? "translate(0,-50%)"
          : t.a === "r"
            ? "translate(-100%,-50%)"
            : "translate(-50%,-50%)",
    }));
    const buildingOpts = BUILDINGS.map((b) => ({ id: b.id, name: b.name }));
    const buildingChips = BUILDINGS.map((b) => ({
      name: b.name,
      bg: s.selB === b.id ? "#171717" : "#ffffff",
      fg: s.selB === b.id ? "#ffffff" : "#171717",
      bd: s.selB === b.id ? "#171717" : "#ebebeb",
      pick: () => this.pickBuilding(b.id),
    }));
    const floorRows = selB.floors.map((f) => {
      const key = selB.id + "-" + f.level;
      const open = !!s.openFloors[key];
      const names = s.members
        .filter((m) => m.building === selB.id && m.floor === f.level)
        .map((m) => m.name)
        .join("・");
      return {
        level: f.level,
        sub: f.rooms.length + "室",
        names,
        arrow: open ? "▲" : "▼",
        open,
        toggle: () => this.toggleFloor(key),
        here: (e: MouseEvent) => {
          e.stopPropagation();
          this.setSelfFloor(selB.id, f.level);
        },
        rooms: f.rooms.map((r) => ({
          label: r.n + (r.t ? " " + r.t : ""),
          bg: s.selRoom === r.id ? "#171717" : "#ffffff",
          fg: s.selRoom === r.id ? "#ffffff" : "#171717",
          bd: s.selRoom === r.id ? "#171717" : "#ebebeb",
          pick: () => this.pickRoom(r.id),
        })),
      };
    });

    // floor opts for selects
    const floorsOf = (bid: string) => {
      const b = bById(bid);
      return b ? b.floors.map((f) => ({ id: f.level, name: f.level })) : [];
    };

    // meeting sheet
    const others = s.members;
    const memberChips = others.map((m) => ({
      name: m.name + (m.id === s.selfId ? "(自分)" : ""),
      bg: s.mtMember === m.id ? "#171717" : "#ffffff",
      fg: s.mtMember === m.id ? "#ffffff" : "#171717",
      bd: s.mtMember === m.id ? "#171717" : "#ebebeb",
      pick: (e: MouseEvent) => {
        e.stopPropagation();
        this.setState({ mtMember: m.id, mtKind: "member" });
      },
    }));
    const placeB = bById(s.placeB) || BUILDINGS[0];
    const placeOpts = [{ id: "spot:" + placeB.id, name: placeB.name + "前(屋外)" }];
    for (const f of placeB.floors)
      for (const r of f.rooms)
        placeOpts.push({ id: "room:" + r.id, name: f.level + " " + r.n + (r.t ? " " + r.t : "") });
    const mtApplyDisabled =
      s.mtKind === "member" ? !s.mtMember : s.mtKind === "place" ? !s.placeR : false;

    const suggestions = s.suggestions.map((sg) => ({
      label: roomFull(sg.ref),
      meta: (sg.note ? "「" + sg.note + "」 ・ " : "") + sg.by + "さんが追加",
      adopt: () => this.adoptSuggestion(sg),
    }));

    // public rooms(実サーバー /api/rooms/public 由来。自分のルームは host_token 保有で判定)
    const publicRooms = s.publicList
      .filter((r) => r.exp > s.now)
      .map((r) => {
        const own = getHostToken(r.id) !== null;
        return {
          title: (r.title || "無名のルーム") + (own ? "(あなたのルーム)" : ""),
          members: r.members,
          remaining: fmtShort(r.exp - s.now),
          open: () => {
            if (own) {
              this.toast("自分のルームです");
              return;
            }
            this.openPublicRoom(r);
          },
        };
      });

    const meetingLabel = this.meetingLabelOf(s.meeting);
    const selfDist = selfM ? this.distTo(selfM, mp) : "—";
    const demoOnMap = s.screen === "map";

    return {
      // screens
      isTop: s.screen === "top",
      isPublic: s.screen === "public",
      isJoin: s.screen === "join",
      isMap: s.screen === "map",
      isExpired: s.screen === "expired",
      isEnded: s.screen === "ended",
      isNotFound: s.screen === "notfound",
      isFull: s.screen === "full",
      screen: s.screen,
      roomId: s.roomId,

      // top / create
      creating: s.creating,
      createLabel: s.creating ? "作成中…" : "作成する",
      createRoom: this.createRoom,
      goPublic: this.goPublic,
      goTop: this.goTop,
      openRoomById: this.openRoomById, // 共有リンク起動時の存在チェック(issue #13 / App.tsx)
      createOpen: s.createOpen,
      cancelCreate: this.cancelCreate,
      submitCreate: this.submitCreate,
      newTitle: s.newTitle,
      onNewTitle: (e: ChangeEvent<HTMLInputElement>) => this.setState({ newTitle: e.target.value }),
      newVisPub: s.newVis === "public",
      newVisDotPriv: s.newVis === "private" ? "#171717" : "transparent",
      newVisDotPub: s.newVis === "public" ? "#171717" : "transparent",
      pickNewPriv: () => this.setState({ newVis: "private" }),
      pickNewPub: () => this.setState({ newVis: "public" }),
      newMeetAt: s.newMeetAt,
      onNewMeetAt: (e: ChangeEvent<HTMLInputElement>) =>
        this.setState({ newMeetAt: e.target.value }),
      newEndAt: fmtMeetLabel(fromLocalInput(s.newMeetAt) + END_OFFSET),
      meetAtLabel: s.meetAt ? fmtMeetLabel(s.meetAt) : "—",
      setMeetAtVal: s.meetAt ? toLocalInput(s.meetAt) : "",
      onSetMeetAt: (e: ChangeEvent<HTMLInputElement>) => this.setMeetAt(e.target.value),
      curEndAt: s.expiresAt ? fmtMeetLabel(s.expiresAt) : "—",

      // public
      refreshPublic: this.refreshPublic,
      refreshAnim: s.refreshing ? "ims-spin .8s linear infinite" : "none",
      publicRooms,
      hasPublicRooms: publicRooms.length > 0,
      noPublicRooms: publicRooms.length === 0,

      // join
      roomTitleDisplay: (s.roomTitle || "無名のルーム") + " ・ " + s.roomId,
      name: s.name,
      onName: (e: ChangeEvent<HTMLInputElement>) => this.setState({ name: e.target.value }),
      nameError: s.name.length > 20 ? "20文字以内で入力してください" : "",
      joinB: s.joinB,
      onJoinB: (e: ChangeEvent<HTMLSelectElement>) =>
        this.setState({ joinB: e.target.value, joinF: "" }),
      joinF: s.joinF,
      onJoinF: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ joinF: e.target.value }),
      joinFloorOpts: floorsOf(s.joinB),
      buildingOpts,
      joinDisabled: !s.name.trim() || s.name.length > 20,
      tapJoin: this.tapJoin,
      joinViewer: this.joinViewer,
      permModal: s.permModal,
      permAllow: this.permAllow,
      permDeny: this.permDeny,

      // timer
      remainingShort: fmtShort(remaining),
      remainingLong: fmtLong(remaining),
      timerColor: remaining < 300000 ? "#ee0000" : "#171717",

      // map
      areasSeg: AREA_ORDER.map((id) => ({
        label: AREAS[id].short,
        bg: s.area === id ? "#171717" : "transparent",
        fg: s.area === id ? "#ffffff" : "#4d4d4d",
        pick: () => this.pickArea(id),
      })),
      reconnecting: s.reconnecting,
      viewerOnly: s.viewerOnly,
      sharePosAgain: this.sharePosAgain,
      vpRef: this.vpRef,
      onMapDown: this.onMapDown,
      onMapMove: this.onMapMove,
      onMapUp: this.onMapUp,
      onMapWheel: this.onMapWheel,
      worldW: A.w,
      worldH: A.h,
      mapTransform: "translate(" + s.view.tx + "px," + s.view.ty + "px) scale(" + s.view.k + ")",
      invScale,
      isCampusArea: s.area === "campus",
      isSt1: s.area === "station_1",
      isSt2: s.area === "station_2",
      campusBuildings,
      mapTexts,
      pinList,
      meetingPinOn,
      meetingPinX,
      meetingPinY,
      pickMode: s.pickMode,
      cancelPick: this.cancelPick,
      startPick: this.startPick,
      pinModal: s.pinModal,
      pinNote: s.pinNote,
      onPinNote: (e: ChangeEvent<HTMLInputElement>) => this.setState({ pinNote: e.target.value }),
      confirmPin: this.confirmPin,
      cancelPin: this.cancelPin,
      meetingSet: !!s.meeting,
      meetingLabel,
      meetingDistSelf: "あなたから " + selfDist,
      clearMeeting: this.clearMeeting,
      meetingByLabel:
        s.meetingBy +
        "が設定" +
        (s.meeting && s.meeting.kind === "member" ? " ・ 移動に追従中" : ""),
      fabZoomIn: this.fabZoomIn,
      fabZoomOut: this.fabZoomOut,
      fabSelf: this.fabSelf,
      fabFit: this.fabFit,
      memberCount: s.members.length,
      areaSummary: sumParts.join(" ・ "),
      openMembers: this.openMembers,
      openMeeting: this.openMeeting,
      openBuilding: this.openBuilding,
      openPlaces: this.openPlaces,
      openShare: this.openShare,
      openSettings: this.openSettings,
      buildingBtnOpacity: s.area === "campus" ? "1" : "0.35",
      tapLeave: this.tapLeave,

      // sheets
      sheetOpen: !!s.sheet,
      closeSheet: this.closeSheet,
      sheetRef: this.sheetRef,
      hDown: this.hDown,
      hMove: this.hMove,
      hUp: this.hUp,
      shMembers: s.sheet === "members",
      shBuilding: s.sheet === "building",
      shMeeting: s.sheet === "meeting",
      shShare: s.sheet === "share",
      shSettings: s.sheet === "settings",
      visBadge: s.visibility === "public" ? "公開" : "非公開",
      visBadgeColor: s.visibility === "public" ? "#ab570a" : "#171717",

      // members sheet
      memberRows,
      selfB: s.selfB || "",
      onSelfB: (e: ChangeEvent<HTMLSelectElement>) => this.setSelfFloor(e.target.value, ""),
      selfF: s.selfF || "",
      onSelfF: (e: ChangeEvent<HTMLSelectElement>) =>
        this.setSelfFloor(s.selfB || "", e.target.value),
      selfFloorOpts: floorsOf(s.selfB || ""),

      // building sheet
      buildingChips,
      spotLabel: selB.name + "前",
      spotMeet: this.spotMeet,
      floorRows,
      roomSel: !!s.selRoom,
      roomSelLabel: s.selRoom ? roomFull(s.selRoom) : "",
      roomMeet: this.roomMeet,
      roomSuggest: this.roomSuggest,

      // meeting sheet
      mtIsMember: s.mtKind === "member",
      mtIsPlace: s.mtKind === "place",
      mtDotMember: s.mtKind === "member" ? "#171717" : "transparent",
      mtDotPlace: s.mtKind === "place" ? "#171717" : "transparent",
      mtPickMember: this.mtPickMember,
      mtPickPlace: this.mtPickPlace,
      memberChips,
      placeB: s.placeB,
      onPlaceB: (e: ChangeEvent<HTMLSelectElement>) =>
        this.setState({ placeB: e.target.value, placeR: "" }),
      placeR: s.placeR,
      onPlaceR: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ placeR: e.target.value }),
      placeOpts,
      mtApply: this.mtApply,
      mtApplyDisabled,
      suggestions,
      noSuggestions: suggestions.length === 0,
      addOpen: s.addOpen,
      addClosed: !s.addOpen,
      toggleAdd: this.toggleAdd,
      addB: s.addB,
      onAddB: (e: ChangeEvent<HTMLSelectElement>) => {
        const b = bById(e.target.value);
        this.setState({ addB: e.target.value, addF: b ? b.floors[0].level : "" });
      },
      ...this.addPlanVals(),
      addNote: s.addNote,
      onAddNote: (e: ChangeEvent<HTMLInputElement>) => this.setState({ addNote: e.target.value }),
      submitAdd: this.submitAdd,

      // settings sheet
      shareUrl: this.shareUrl(),
      copyLink: this.copyLink,
      webShare: this.webShare,
      isHost: s.isHost,
      visPublic: s.visibility === "public",
      visDotPriv: s.visibility === "private" ? "#171717" : "transparent",
      visDotPub: s.visibility === "public" ? "#171717" : "transparent",
      pickPrivate: this.pickPrivate,
      pickPublic: this.pickPublic,
      titleVal: s.roomTitle,
      onTitle: (e: ChangeEvent<HTMLInputElement>) => this.setState({ roomTitle: e.target.value }),
      warnPublic: s.warnPublic,
      confirmPublic: this.confirmPublic,
      cancelPublic: this.cancelPublic,
      leaveOpen: s.leaveOpen,
      doLeave: this.doLeave,
      cancelLeave: this.cancelLeave,
      connFail: s.connFail,
      retryConn: this.retryConn,

      // demo / toasts
      demoOpen: s.demoOpen,
      toggleDemo: this.toggleDemo,
      demoActions: this.demoList(),
      demoChipOn:
        !s.sheet && !s.permModal && !s.warnPublic && !s.leaveOpen && !s.connFail && !s.pinModal,
      demoBtnBottom: demoOnMap ? "300px" : "16px",
      demoPanelBottom: demoOnMap ? "334px" : "50px",
      toasts: s.toasts,
      toastBottom: demoOnMap ? "140px" : "80px",
    };
  }

  // 空き教室追加パネルの派生値(プロトタイプの IIFE を切り出し)。
  private addPlanVals() {
    const s = this.state;
    const b = bById(s.addB) || BUILDINGS[0];
    const f = b.floors.find((x) => x.level === s.addF) || b.floors[0];
    const sel = new Set(s.addRs);
    const cell = (r: Room) => ({
      n: r.n,
      t: r.t || "",
      bg: sel.has(r.id) ? "#171717" : "#ffffff",
      fg: sel.has(r.id) ? "#ffffff" : "#171717",
      pick: () =>
        this.setState((st) => ({
          addRs: st.addRs.includes(r.id) ? st.addRs.filter((x) => x !== r.id) : [...st.addRs, r.id],
        })),
    });
    const half = Math.ceil(f.rooms.length / 2);
    return {
      addFloorTabs: b.floors.map((fl) => ({
        name: fl.level,
        bg: f.level === fl.level ? "#171717" : "#ffffff",
        fg: f.level === fl.level ? "#ffffff" : "#4d4d4d",
        bd: f.level === fl.level ? "#171717" : "#ebebeb",
        pick: () => this.setState({ addF: fl.level }),
      })),
      addPlanTitle: b.name + " " + f.level,
      addPlanTop: f.rooms.slice(0, half).map(cell),
      addPlanBottom: f.rooms.slice(half).map(cell),
      addPlanHasBottom: f.rooms.length > half,
      addRSel: s.addRs.length > 0,
      addSelCount: s.addRs.length,
      addSelLabel: s.addRs.map((rid) => roomFull(rid)).join(" / "),
      addSubmitLabel: s.addRs.length ? "追加する(" + s.addRs.length + ")" : "追加する",
    };
  }
}

export type RoomVals = ReturnType<RoomEngine["renderVals"]>;
