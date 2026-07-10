// プロトタイプ(いまそこ Prototype.dc.html)の `Component extends DCLogic` を、
// フレームワーク非依存の状態機械クラスとして 1:1 移植したもの。
// this.setState → 内部マージ + 購読者通知、React.createRef → 素の ref オブジェクトに置換。
// 派生値は renderVals()(プロトタイプと同名)で計算する。

import type { ChangeEvent, RefObject } from "react";
import type {
  AreaId,
  DemoRoom,
  MeetingPoint,
  Member,
  PlaceSuggestion,
  Toast,
} from "@/types/campus";
import { AREAS, MAP_AREAS } from "@/lib/mapAreas";
import {
  BUILDINGS,
  CLAMP,
  bById,
  mergeCampus,
  setBuildings,
  setClassrooms,
} from "@/lib/campusData";
import {
  POSITION_MIN_MOVE_M,
  POSITION_THROTTLE_MS,
  serverConfig,
  setServerConfig,
} from "@/lib/constants";
import { fmtMeetLabel, fromLocalInput, toLocalInput } from "@/lib/format";
import { topVals } from "@/state/selectors/topVals";
import { mapVals } from "@/state/selectors/mapVals";
import { sheetVals } from "@/state/selectors/sheetVals";
import { api, getName, pruneHostTokens, saveName } from "@/lib/api";
import { clampToEdge, metersBetween, project } from "@/lib/coords";
import type { ClientMsg } from "@/types/messages";
import { locate } from "@/lib/wire";
import { MapGestureController } from "./MapGestureController";
import { MeetingModel } from "./MeetingModel";
import { RoomSession } from "./RoomSession";
import { RoomSocketHandler } from "./RoomSocketHandler";
import { SheetController } from "./SheetController";

type Screen = "top" | "public" | "join" | "map" | "expired" | "ended" | "notfound" | "full";
type SheetName = "members" | "building" | "meeting" | "places" | "share" | "settings";
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
  /** ルーム作成モーダルの入力(issue #163:サブフォーム単位のネスト。更新は patchSub 経由) */
  create: { title: string; vis: Visibility; meetAt: string };
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
  /** 参加フォームの建物・階の選択(issue #163) */
  join: { b: string; f: string };
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
  /** 集合場所シートの指定フォーム(issue #163) */
  mt: {
    kind: "coords" | "member" | "place";
    member: string | null;
    placeB: string;
    placeR: string;
  };
  suggestions: PlaceSuggestion[];
  /** 空き教室の追加パネル(issue #163) */
  add: { open: boolean; b: string; f: string; rs: string[]; note: string };
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
/** patchSub で部分更新できるサブフォームのキー(State のネスト定義と同期させる。issue #163) */
type SubFormKey = "create" | "join" | "mt" | "add";

export class RoomEngine {
  state: State;
  version = 0;
  vpRef: RefObject<HTMLDivElement> = { current: null };
  sheetRef: RefObject<HTMLDivElement> = { current: null };

  private listeners = new Set<() => void>();
  // 地図ジェスチャ(パン / ピンチ / ホイール / fit・center / FAB)の実体(issue #103)。
  // selector(mapVals / sheetVals)からも直接参照する(純転送層を挟まない。docs/08 W1)。
  readonly gesture: MapGestureController;
  // シート開閉アニメ・ハンドルのドラッグ・退場タイマーの実体(issue #104)。
  // selector からも直接参照する(docs/08 W2)。
  readonly sheetCtl: SheetController;
  private toastN = 0;
  private clock: ReturnType<typeof setInterval> | null = null;
  // WS 受信処理の実体(issue #164)。RoomContext からも直接参照する(純転送層を挟まない。docs/08)。
  readonly socket: RoomSocketHandler;
  // 集合場所ドメインの実体(issue #173)。selector からも直接参照する(純転送層を挟まない。docs/08)。
  readonly meeting: MeetingModel;
  // ルームのライフサイクル REST(作成/開く/公開一覧/公開範囲/ルーム名同期)の実体(issue #173)。
  // selector・App からも直接参照する(純転送層を挟まない。docs/08)。
  readonly session: RoomSession;
  // WebSocket 送信関数(RoomContext の useRoomSocket から注入。issue #1)。
  private socketSend: ((msg: ClientMsg) => void) | null = null;
  // 位置送信スロットリング(2秒 / 5m。issue #2)。
  private lastPosSentAt = 0;
  private lastSentPos: { lat: number; lng: number } | null = null;
  private geoFirstFix = true; // 最初の測位でビューを現在エリアへ合わせる

  constructor() {
    this.state = this.initialState();
    this.gesture = new MapGestureController({
      getVp: () => this.vpRef.current,
      getState: () => this.state,
      setState: (patch, cb) => this.setState(patch, cb),
      toast: (msg) => this.toast(msg),
    });
    this.sheetCtl = new SheetController({
      getSheetEl: () => this.sheetRef.current,
      getState: () => this.state,
      setState: (patch, cb) => this.setState(patch, cb),
    });
    this.socket = new RoomSocketHandler({
      getState: () => this.state,
      setState: (patch) => this.setState(patch),
      toast: (msg) => this.toast(msg),
      keepMeetingOnLeave: (left) => this.meeting.keepOnLeave(left),
    });
    this.meeting = new MeetingModel({
      getState: () => this.state,
      setState: (patch) => this.setState(patch),
      patchMt: (p) => this.patchSub("mt", p),
      toast: (msg) => this.toast(msg),
      send: (msg) => this.send(msg),
      // 接続時のみ echo が返るため、接続判定込みで予約する
      expectMeetingEcho: () => {
        if (this.socketSend) this.socket.expectMeetingEcho();
      },
    });
    this.session = new RoomSession({
      getState: () => this.state,
      setState: (patch) => this.setState(patch),
      toast: (msg) => this.toast(msg),
      initialState: () => this.initialState(),
    });
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
  // selectors/*(mapVals・sheetVals)から状態更新ハンドラを組み立てるため public 化(issue #101)。
  setState(patch: Patch, cb?: () => void) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.emit();
    if (cb) cb();
  }
  // サブフォーム(create / join / mt / add)の部分更新。ネスト先だけを差し替え、
  // 無関係フィールドの巻き込み更新を型で防ぐ(issue #163)。
  patchSub<K extends SubFormKey>(key: K, p: Partial<State[K]>) {
    this.setState((s) => ({ [key]: { ...s[key], ...p } }) as Partial<State>);
  }

  initialState(): State {
    const now = Date.now();
    return {
      screen: "top",
      creating: false,
      refreshing: false,
      createOpen: false,
      create: { title: "", vis: "private", meetAt: "" },
      meetAt: 0,
      roomId: "k7m2pq",
      roomTitle: "",
      visibility: "private",
      isHost: true,
      selfId: "",
      publicList: [],
      name: getName(), // 前回入力した表示名を初期値に(issue #22)
      join: { b: "", f: "" },
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
      mt: { kind: "place", member: null, placeB: "b1", placeR: "" },
      suggestions: [],
      add: { open: false, b: "b1", f: "", rs: [], note: "" },
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
    pruneHostTokens(); // 期限切れルームの host_token を掃除(imasoko.host.* が溜まり続けないように)
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
    this.session.stop(); // ルーム名デバウンスのタイマー破棄
    this.sheetCtl.stop();
  }

  // キャンパスマスタを実サーバーから取得し建物データを差し替える(issue #14)。
  // 失敗時は campusData.ts のフォールバック定義を維持する。
  async loadCampus() {
    try {
      const res = await api.getCampus();
      setBuildings(mergeCampus(res));
      setClassrooms(res.classrooms ?? []); // 教室の空き情報(issue #142)
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
  // 表示 3.2s → closing を立てて退場アニメ(.2s)→ 削除の2段階(sheetClosing と同じ方式)。
  toast(msg: string) {
    const id = ++this.toastN;
    this.setState((s) => ({ toasts: [...s.toasts, { id, msg }] }));
    setTimeout(() => {
      this.setState((s) => ({
        toasts: s.toasts.map((t) => (t.id === id ? { ...t, closing: true } : t)),
      }));
      setTimeout(
        () => this.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
        200
      );
    }, 3200);
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
      building_id: s.join.b || null,
      floor: s.join.f || null,
    };
  }
  /** socket status を再接続バー表示に反映する。 */
  setSocketStatus(status: "connecting" | "open" | "reconnecting" | "closed") {
    const reconnecting = status === "reconnecting";
    if (this.state.reconnecting !== reconnecting) this.setState({ reconnecting });
  }
  // ── navigation ──
  goTop = () => {
    this.setState({ ...this.initialState(), publicList: this.state.publicList, now: Date.now() });
  };
  createRoom = () =>
    this.setState({
      createOpen: true,
      create: { title: "", vis: "private", meetAt: toLocalInput(Date.now()) },
    });
  cancelCreate = () => this.setState({ createOpen: false });
  setMeetAt = (v: string) => {
    const meetAt = fromLocalInput(v);
    this.setState({ meetAt, expiresAt: meetAt + serverConfig.endOffsetMs });
    this.toast("集合時間を " + fmtMeetLabel(meetAt) + " に変更しました");
  };
  goPublic = () => {
    this.setState({ screen: "public" });
    void this.session.loadPublicRooms();
  };

  // ── join ──
  // 参加ボタンを押せるか。ボタンの無効化(topVals の joinDisabled)と tapJoin のガードの単一ソース。
  canJoin = () => {
    const n = this.state.name;
    return !!n.trim() && n.length <= serverConfig.maxNameLength;
  };
  tapJoin = () => {
    if (!this.canJoin()) return;
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
        selfB: s.join.b,
        selfF: s.join.f,
      },
      () => {
        requestAnimationFrame(() => this.gesture.fitArea());
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
      if (loc.area !== this.state.area)
        this.setState({ area: loc.area }, () => this.gesture.fitArea());
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

  // ── map view(ジェスチャは this.gesture を直接参照。旧・公開名維持の委譲は撤去。docs/08 W1)──
  startPick = () => this.setState({ pickMode: true, sheet: null });
  cancelPick = () => this.setState({ pickMode: false });
  cancelPin = () => this.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  onPinNote = (e: ChangeEvent<HTMLInputElement>) => this.setState({ pinNote: e.target.value });
  confirmPin = () => {
    const p = this.state.pendingPin;
    if (!p) return;
    this.meeting.set(
      { kind: "coords", area: p.area, x: p.x, y: p.y, note: this.state.pinNote.trim() },
      "あなた"
    );
    this.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  };
  // ── sheets(開閉・ドラッグは this.sheetCtl を直接参照。旧・公開名維持の委譲は撤去。docs/08 W2)──
  openMembers = () => this.sheetCtl.open("members");
  openMeeting = () => this.sheetCtl.open("meeting");
  openPlaces = () => this.sheetCtl.open("places"); // 空き教室・候補(集合場所とは別シート。issue #149)
  openShare = () => this.sheetCtl.open("share");
  openSettings = () => this.sheetCtl.open("settings");
  openBuilding = () => {
    if (this.state.area !== "campus") {
      this.toast("建物はキャンパスエリアで利用できます");
      return;
    }
    this.sheetCtl.open("building");
  };

  // ── building panel ──
  // マップ上の建物タップ:その建物を選択して建物シートを開く(renderVals の map 派生値から利用)。
  pickMapBuilding = (id: string) => this.setState({ selB: id, sheet: "building" });
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
    this.meeting.set({ kind: "place", type: "classroom", ref: rid }, "あなた");
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
    this.meeting.set({ kind: "place", type: "spot", ref: this.state.selB }, "あなた");
    this.setState({ sheet: null });
  };

  toggleAdd = () =>
    this.setState((s) => {
      const b = bById(s.add.b) || BUILDINGS[0];
      return { add: { ...s.add, open: !s.add.open, f: b.floors[0].level, rs: [], note: "" } };
    });
  submitAdd = () => {
    const s = this.state;
    if (!s.add.rs.length) {
      this.toast("教室を選択してください");
      return;
    }
    const existing = new Set(s.suggestions.map((x) => x.ref));
    const fresh = s.add.rs.filter((rid) => !existing.has(rid));
    if (!fresh.length) {
      this.toast("選択した教室はすべて追加済みです");
      return;
    }
    const note = s.add.note.trim();
    const now = Date.now();
    const added: PlaceSuggestion[] = fresh.map((rid, i) => ({
      id: "sg" + (now + i),
      kind: "room",
      ref: rid,
      note,
      by: "あなた",
    }));
    const dupN = s.add.rs.length - fresh.length;
    this.setState({
      suggestions: [...s.suggestions, ...added],
      add: { ...s.add, open: false, note: "", rs: [] },
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
  tapLeave = () => this.setState({ leaveOpen: true });
  cancelLeave = () => this.setState({ leaveOpen: false });
  doLeave = () => {
    this.send({ type: "leave" });
    this.toast("退出しました");
    this.goTop();
  };
  // ── render helpers ──
  // 現在見えている表示領域をワールド座標の矩形で返す(範囲外ピンを画面端に出すため。issue #3)。
  viewportRect(): { xmin: number; ymin: number; xmax: number; ymax: number } {
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

  clampedPos(
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
  renderVals() {
    const s = this.state;
    const onMap = s.screen === "map";

    return {
      // top / public / join / timer + screens(トップ〜参加フォームの派生値は
      // selectors/topVals へ分離。出力キー・値・キー順は不変。issue #102)
      ...topVals(this),

      // map(地図画面の派生値は selectors/mapVals へ分離。出力キー・値は不変。issue #100)
      ...mapVals(this),

      // sheets(共通枠 + members / building / meeting / settings は selectors/sheetVals へ分離。
      // 出力キー・値・キー順は不変。issue #101)
      ...sheetVals(this),

      // toasts(上側に表示。map 画面はエリア切替+集合バーの下に出す)
      toasts: s.toasts,
      toastTop: onMap ? "100px" : "16px",
    };
  }
}

export type RoomVals = ReturnType<RoomEngine["renderVals"]>;
