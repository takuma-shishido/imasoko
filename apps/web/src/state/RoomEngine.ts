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
import { AREAS, AREA_ORDER, MAP_AREAS } from "@/lib/mapAreas";
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
import {
  POSITION_MIN_MOVE_M,
  POSITION_THROTTLE_MS,
  serverConfig,
  setServerConfig,
} from "@/lib/constants";
import { fmtLong, fmtMeetLabel, fmtShort, fromLocalInput, toLocalInput } from "@/lib/format";
import { api, HttpError, getHostToken, getName, saveHostToken, saveName } from "@/lib/api";
import { clampToEdge, metersBetween, project, unproject } from "@/lib/coords";
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

// ボトムシート退場アニメーションの長さ(ms)。global.css の ims-sheet-out / ims-fade-out と一致させる(issue #71)。
const SHEET_EXIT_MS = 200;

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
  /** 退場アニメーション中フラグ。true の間もシートはマウントしたまま下スライドで閉じる(issue #71)。 */
  sheetClosing: boolean;
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
  toasts: Toast[];
  warnPublic: boolean;
  leaveOpen: boolean;
  members: Member[];
  selfB?: string;
  selfF?: string;
}

type Patch = Partial<State> | ((s: State) => Partial<State>);

// 選択チップの色(選択状態に応じた背景 bg / 文字 fg / 枠線 bd の三つ組)。renderVals 内で逐語反復していたパターンを集約する(issue #99)。
// fgOff = 非選択時の文字色(既定 #171717。フロアタブ / エリアセグメントのみ #4d4d4d)。
// bgOff = 非選択時の背景色(既定 #ffffff。エリアセグメントのみ透明)。
function selChip(selected: boolean, fgOff = "#171717", bgOff = "#ffffff") {
  return {
    bg: selected ? "#171717" : bgOff,
    fg: selected ? "#ffffff" : fgOff,
    bd: selected ? "#171717" : "#ebebeb",
  };
}

// 選択ドットの色(選択時のみ塗り、非選択は透明)。ラジオ的なドット表示で反復していたパターンを集約する(issue #99)。
function selDot(selected: boolean): string {
  return selected ? "#171717" : "transparent";
}

export class RoomEngine {
  state: State;
  version = 0;
  vpRef: RefObject<HTMLDivElement> = { current: null };
  sheetRef: RefObject<HTMLDivElement> = { current: null };

  private listeners = new Set<() => void>();
  private drag: { sx: number; sy: number; tx: number; ty: number; moved: boolean } | null = null;
  // 地図上のアクティブなポインタを pointerId 単位で保持(1本=パン / 2本=ピンチズーム。issue #68)。
  private pointers = new Map<number, { x: number; y: number }>();
  // 現在のジェスチャがピンチを含んだか(ピンチを集合地点タップに誤反応させないため)。
  private pinched = false;
  // t0 はフリック速度算出用(issue #71)。
  private sheetDrag: { sy: number; t0: number; dy?: number } | null = null;
  // ボトムシート退場アニメーション完了後に実際にアンマウントするためのタイマー(issue #71)。
  private sheetCloseTimer: ReturnType<typeof setTimeout> | null = null;
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
      sheetClosing: false,
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
      toasts: [],
      warnPublic: false,
      leaveOpen: false,
      members: [],
    };
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
    if (this.sheetCloseTimer) clearTimeout(this.sheetCloseTimer);
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
    this.setState({ ...this.initialState(), publicList: this.state.publicList, now: Date.now() });
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
        ...this.initialState(),
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
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      // 2本目の指:ピンチへ遷移。単一パンは破棄し、以降は 2点間距離でズームする(issue #68)。
      this.drag = null;
      this.pinched = true;
      return;
    }
    // 1本目の指:従来どおりパン開始(この時点で新しいジェスチャの開始)。
    this.pinched = false;
    this.drag = {
      sx: e.clientX,
      sy: e.clientY,
      tx: this.state.view.tx,
      ty: this.state.view.ty,
      moved: false,
    };
  };
  onMapMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;

    // 2ポインタ:ピンチズーム。2点間距離の比でスケールし、2点の中点を中心にする。
    // 中点の移動分がそのままパンになる(ピンチしながらの平行移動に追従)。issue #68。
    if (this.pointers.size >= 2) {
      // 先頭2つの pointerId をピンチの2点として扱う(3本目以降は追跡のみで計算に使わない)。
      const [id0, id1] = [...this.pointers.keys()];
      const p0 = this.pointers.get(id0)!;
      const p1 = this.pointers.get(id1)!;
      const prevMidX = (p0.x + p1.x) / 2;
      const prevMidY = (p0.y + p1.y) / 2;
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      // 動いたポインタの新座標を反映(p は p0/p1 いずれかと同一参照)。prev は反映前に確定済み。
      p.x = e.clientX;
      p.y = e.clientY;
      const curMidX = (p0.x + p1.x) / 2;
      const curMidY = (p0.y + p1.y) / 2;
      const curDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      if (prevDist === 0 || curDist === 0) return;
      const vp = this.vpRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const { tx, ty, k } = this.state.view;
      const A = AREAS[this.state.area];
      const fit = Math.min(r.width / A.w, r.height / A.h);
      // onMapWheel / zoomBy と同じ nk クランプ(fit*0.7〜3.5)。
      const nk = Math.min(3.5, Math.max(fit * 0.7, k * (curDist / prevDist)));
      const pmx = prevMidX - r.left;
      const pmy = prevMidY - r.top;
      const cmx = curMidX - r.left;
      const cmy = curMidY - r.top;
      this.setState({
        view: { k: nk, tx: cmx - ((pmx - tx) / k) * nk, ty: cmy - ((pmy - ty) / k) * nk },
      });
      return;
    }

    // 1ポインタ:従来どおりパン。格納座標も最新化しておく。パン中は drag だけ更新すると
    // pointers の座標が down 時のまま陳腐化し、この指が後からピンチの1本目になった際に
    // 2本目 down 直後の prevDist/prevMid が古くなって初回フレームがポップする(issue #68)。
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.drag) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
    if (this.drag.moved)
      this.setState({ view: { ...this.state.view, tx: this.drag.tx + dx, ty: this.drag.ty + dy } });
  };
  onMapUp = (e: PointerEvent<HTMLDivElement>) => {
    const wasTracked = this.pointers.delete(e.pointerId);
    // まだ 2 本以上残っていればピンチ継続。
    if (this.pointers.size >= 2) return;
    // ピンチ → 1 本に減った場合:残る指でパンを継続(指を離した瞬間の破綻を防ぐ)。
    if (this.pointers.size === 1) {
      this.resumePanFromRemaining();
      return;
    }
    // 全ての指が離れた:ジェスチャ終了。
    const d = this.drag;
    const pinched = this.pinched;
    this.drag = null;
    this.pinched = false;
    // ピンチだった/地図外(FAB 等の追跡外)は集合地点タップにしない。
    if (pinched || !wasTracked) return;
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
  // 指が離れた/中断された時のポインタ解放(pointercancel も同じ扱い。issue #68)。
  onMapCancel = (e: PointerEvent<HTMLDivElement>) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) this.resumePanFromRemaining();
    else if (this.pointers.size === 0) {
      this.drag = null;
      this.pinched = false;
    }
  };
  // ピンチ(2本)から 1 本に減った際、残る指の現在位置からパンを引き継ぐ。
  // moved:true で開始し、この持ち替えが集合地点タップに化けないようにする。
  private resumePanFromRemaining() {
    const [id] = [...this.pointers.keys()];
    const rp = this.pointers.get(id);
    if (!rp) return;
    this.drag = { sx: rp.x, sy: rp.y, tx: this.state.view.tx, ty: this.state.view.ty, moved: true };
  }
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
    // 閉じ中に開き直したら退場をキャンセルして即表示する(入場アニメーションで開く)。
    if (this.sheetCloseTimer) {
      clearTimeout(this.sheetCloseTimer);
      this.sheetCloseTimer = null;
    }
    // 退場のために付けた inline の transition/transform を消し、再オープンを綺麗な状態から始める。
    const el = this.sheetRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    this.setState({ sheet: name, sheetClosing: false });
  }
  // 退場アニメーション付きで閉じる。closing の間もシートをマウントしたまま、
  // 現在の transform(ドラッグ途中の translateY(dy) でもタップ時の 0 でも)から
  // translateY(100%) へ CSS transition で連続的にスライドさせる(途中から閉じても
  // 全開位置へ戻らず滑らかに閉じる。issue #71)。アニメーション長 SHEET_EXIT_MS 経過後に取り外す。
  // 背景タップ・ハンドルのドラッグ/フリック(hUp)いずれの閉じ操作もここを通る。
  closeSheet = () => {
    if (!this.state.sheet || this.state.sheetClosing) return;
    const el = this.sheetRef.current;
    if (el) {
      el.style.transition = "transform " + SHEET_EXIT_MS + "ms cubic-bezier(.4,0,.6,1)";
      el.style.transform = "translateY(100%)";
    }
    this.setState({ sheetClosing: true });
    if (this.sheetCloseTimer) clearTimeout(this.sheetCloseTimer);
    this.sheetCloseTimer = setTimeout(() => {
      this.sheetCloseTimer = null;
      this.setState({ sheet: null, sheetClosing: false, selRoom: null, addOpen: false });
    }, SHEET_EXIT_MS);
  };
  hDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    // ドラッグ追従は即時にする(前回の退場/戻しで付いた transition を解除)。
    if (this.sheetRef.current) this.sheetRef.current.style.transition = "";
    this.sheetDrag = { sy: e.clientY, t0: Date.now() };
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
    const el = this.sheetRef.current;
    if (!d || !d.dy) {
      if (el) el.style.transform = ""; // ほぼ動いていない(タップ相当)→ そのまま
      return;
    }
    // 距離(70px 超)で閉じる。加えて携帯での素早いフリック(短距離でも速い下ドラッグ)でも
    // 閉じられるようにする(しきい値だけだと携帯でハンドルを掴んで軽く下ろしても閉じにくい。issue #71)。
    // velocity は down→up 全体の平均速度(離す瞬間の瞬間速度ではない)。長く保持してから払うと
    // 平均が下がりフリック判定に乗らないが、その場合も距離(70px)経路が拾うため実害は小さい。
    const dt = Math.max(1, Date.now() - d.t0);
    const velocity = d.dy / dt; // px/ms(平均)
    if (d.dy > 70 || (d.dy > 24 && velocity > 0.5)) {
      this.closeSheet(); // 現在の translateY(dy) から連続して退場(transform は戻さない)
    } else if (el) {
      // 閾値未満:掴んだ位置から元位置へアニメーションで戻す(スナップバック)。
      el.style.transition = "transform .18s cubic-bezier(.3,.8,.4,1)";
      el.style.transform = "";
    }
  };
  // ハンドルのドラッグがシステム中断された場合の解放(ヒット領域拡大で発火機会が増える。issue #71)。
  hCancel = () => {
    this.sheetDrag = null;
    const el = this.sheetRef.current;
    if (el) {
      el.style.transition = "transform .18s cubic-bezier(.3,.8,.4,1)";
      el.style.transform = "";
    }
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
  // 現在見えている表示領域をワールド座標の矩形で返す(範囲外ピンを画面端に出すため。issue #3)。
  private viewportRect(): { xmin: number; ymin: number; xmax: number; ymax: number } {
    const A = AREAS[this.state.area];
    const vp = this.vpRef.current;
    if (!vp) return { xmin: 26, ymin: 26, xmax: A.w - 26, ymax: A.h - 26 };
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.state.view;
    const m = 34 / k; // 画面端からのマージン(px 換算)
    return {
      xmin: -tx / k + m,
      ymin: -ty / k + m,
      xmax: (r.width - tx) / k - m,
      ymax: (r.height - ty) / k - m,
    };
  }

  private clampedPos(
    m: Member,
    idxMap: Record<string, number>,
    vr: { xmin: number; ymin: number; xmax: number; ymax: number }
  ) {
    const cur = this.state.area;
    const A = AREAS[cur];
    if (m.lost || m.area !== cur) {
      // 実 GPS があれば「その人がいる実方向」で表示領域の端に寄せる(現在地=self を基点。issue #3)。
      if (m.lat != null && m.lng != null) {
        const P = project(MAP_AREAS[cur], m.lat, m.lng);
        const self = this.state.members.find((x) => x.id === this.state.selfId);
        const sp =
          self && self.area === cur && self.lat != null && self.lng != null
            ? project(MAP_AREAS[cur], self.lat, self.lng)
            : { x: (vr.xmin + vr.xmax) / 2, y: (vr.ymin + vr.ymax) / 2 };
        // 基点は表示領域内にクランプ(必ず内側から方向を出す)。
        const rx = Math.min(Math.max(sp.x, vr.xmin), vr.xmax);
        const ry = Math.min(Math.max(sp.y, vr.ymin), vr.ymax);
        const e = clampToEdge(rx, ry, P.x, P.y, vr.xmin, vr.ymin, vr.xmax, vr.ymax);
        return { x: e.x, y: e.y, out: true };
      }
      // 位置不明はフォールバック(従来の固定 CLAMP)。
      if (m.lost) {
        const [x, y] = CLAMP[cur].lost;
        const i = idxMap.lost++;
        return { x: x + i * 44, y, out: true };
      }
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
  // 目的地(集合場所)までの距離を GPS 実座標(緯度経度)から計算する(issue #28)。
  // 位置未共有(lat/lng なし)は「—」。目的地の緯度経度は resolveMeetingPos の x/y を unproject で復元。
  private distTo(m: Member, mp: { area: AreaId; x: number; y: number } | null): string {
    // 閲覧のみ/位置未共有は「—」。範囲外(lost)でも GPS があれば実距離を出す(issue #28)。
    if (!mp || m.viewer || m.lat == null || m.lng == null) return "—";
    const dest = unproject(MAP_AREAS[mp.area], mp.x, mp.y);
    return this.fmtDist(metersBetween({ lat: m.lat, lng: m.lng }, dest));
  }
  private fmtDist(d: number): string {
    if (d >= 1000) return "約" + (d / 1000).toFixed(d >= 10000 ? 0 : 1) + "km";
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
    const vr = this.viewportRect();
    const pinList = [];
    for (const m of s.members) {
      if (m.viewer) continue;
      const pos = this.clampedPos(m, idxMap, vr);
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
      ...selChip(s.selB === b.id),
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
          ...selChip(s.selRoom === r.id),
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
      ...selChip(s.mtMember === m.id),
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
    // 自分のルームでもタップで再参加できる(host は openRoomById で復元。issue #21)。
    const publicRooms = s.publicList
      .filter((r) => r.exp > s.now)
      .map((r) => {
        const own = getHostToken(r.id) !== null;
        return {
          title: (r.title || "無名のルーム") + (own ? "(あなたのルーム)" : ""),
          members: r.members,
          remaining: fmtShort(r.exp - s.now),
          open: () => this.openPublicRoom(r),
        };
      });

    const meetingLabel = this.meetingLabelOf(s.meeting);
    const selfDist = selfM ? this.distTo(selfM, mp) : "—";
    const onMap = s.screen === "map";

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
      newVisDotPriv: selDot(s.newVis === "private"),
      newVisDotPub: selDot(s.newVis === "public"),
      pickNewPriv: () => this.setState({ newVis: "private" }),
      pickNewPub: () => this.setState({ newVis: "public" }),
      newMeetAt: s.newMeetAt,
      onNewMeetAt: (e: ChangeEvent<HTMLInputElement>) =>
        this.setState({ newMeetAt: e.target.value }),
      newEndAt: fmtMeetLabel(fromLocalInput(s.newMeetAt) + serverConfig.endOffsetMs),
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
      nameMax: serverConfig.maxNameLength,
      onName: (e: ChangeEvent<HTMLInputElement>) => this.setState({ name: e.target.value }),
      nameError:
        s.name.length > serverConfig.maxNameLength
          ? `${serverConfig.maxNameLength}文字以内で入力してください`
          : "",
      joinB: s.joinB,
      onJoinB: (e: ChangeEvent<HTMLSelectElement>) =>
        this.setState({ joinB: e.target.value, joinF: "" }),
      joinF: s.joinF,
      onJoinF: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ joinF: e.target.value }),
      joinFloorOpts: floorsOf(s.joinB),
      buildingOpts,
      joinDisabled: !s.name.trim() || s.name.length > serverConfig.maxNameLength,
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
      areasSeg: AREA_ORDER.map((id) => {
        const c = selChip(s.area === id, "#4d4d4d", "transparent");
        return {
          label: AREAS[id].short,
          bg: c.bg,
          fg: c.fg,
          pick: () => this.pickArea(id),
        };
      }),
      reconnecting: s.reconnecting,
      viewerOnly: s.viewerOnly,
      sharePosAgain: this.sharePosAgain,
      vpRef: this.vpRef,
      onMapDown: this.onMapDown,
      onMapMove: this.onMapMove,
      onMapUp: this.onMapUp,
      onMapCancel: this.onMapCancel,
      onMapWheel: this.onMapWheel,
      worldW: A.w,
      worldH: A.h,
      mapTransform: "translate(" + s.view.tx + "px," + s.view.ty + "px) scale(" + s.view.k + ")",
      invScale,
      area: s.area,
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
      memberMax: serverConfig.maxMembersPerRoom, // 上限は /api/config 由来(issue #43)
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
      sheetClosing: s.sheetClosing,
      closeSheet: this.closeSheet,
      sheetRef: this.sheetRef,
      hDown: this.hDown,
      hMove: this.hMove,
      hUp: this.hUp,
      hCancel: this.hCancel,
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
      mtDotMember: selDot(s.mtKind === "member"),
      mtDotPlace: selDot(s.mtKind === "place"),
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

      // toasts(map 画面は下シートを避けて高めに出す)
      toasts: s.toasts,
      toastBottom: onMap ? "140px" : "80px",
    };
  }

  // 空き教室追加パネルの派生値(プロトタイプの IIFE を切り出し)。
  private addPlanVals() {
    const s = this.state;
    const b = bById(s.addB) || BUILDINGS[0];
    const f = b.floors.find((x) => x.level === s.addF) || b.floors[0];
    const sel = new Set(s.addRs);
    const cell = (r: Room) => {
      const c = selChip(sel.has(r.id));
      return {
        n: r.n,
        t: r.t || "",
        bg: c.bg,
        fg: c.fg,
        pick: () =>
          this.setState((st) => ({
            addRs: st.addRs.includes(r.id)
              ? st.addRs.filter((x) => x !== r.id)
              : [...st.addRs, r.id],
          })),
      };
    };
    const half = Math.ceil(f.rooms.length / 2);
    return {
      addFloorTabs: b.floors.map((fl) => ({
        name: fl.level,
        ...selChip(f.level === fl.level, "#4d4d4d"),
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
