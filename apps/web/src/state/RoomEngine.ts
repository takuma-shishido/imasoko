// プロトタイプ(いまそこ Prototype.dc.html)の `Component extends DCLogic` を、
// フレームワーク非依存の状態機械クラスとして移植したもの。
// this.setState → 内部マージ + 購読者通知、React.createRef → 素の ref オブジェクトに置換。
// 役割ごとのロジックは engine/ 配下のコントローラへ分割し(issue #74)、本クラスは
// 外部ストア接続(subscribe / setState)・コントローラの束ね・公開 API の委譲に徹する。
// 派生値は renderVals()(プロトタイプと同名。engine/renderVals.ts)で計算する。

import type { RefObject } from "react";
import { api } from "@/lib/api";
import { mergeCampus, setBuildings } from "@/lib/campusData";
import { setServerConfig } from "@/lib/constants";
import { initialState } from "./engine/types";
import type { EngineCore, Patch, State } from "./engine/types";
import { MapViewController } from "./engine/MapViewController";
import { SheetController } from "./engine/SheetController";
import { MeetingController } from "./engine/MeetingController";
import { BuildingController } from "./engine/BuildingController";
import { SocketController } from "./engine/SocketController";
import { GeoController } from "./engine/GeoController";
import { RoomSessionController } from "./engine/RoomSessionController";
import { renderVals } from "./engine/renderVals";
import type { RoomVals } from "./engine/renderVals";

export type { State } from "./engine/types";

export class RoomEngine implements EngineCore {
  state: State = initialState();
  version = 0;
  vpRef: RefObject<HTMLDivElement> = { current: null };
  sheetRef: RefObject<HTMLDivElement> = { current: null };

  private listeners = new Set<() => void>();
  private toastN = 0;
  private clock: ReturnType<typeof setInterval> | null = null;

  // ── controllers(役割ごとの分割。issue #74)──
  private map = new MapViewController(this, this.vpRef);
  private sheetCtrl = new SheetController(this, this.sheetRef);
  private meeting = new MeetingController(this);
  private building = new BuildingController(this, this.meeting);
  // 型注釈は必須:send/sendMeeting(EngineCore)がこのフィールドへ委譲するため、
  // 推論に任せると初期化子の this(EngineCore 適合チェック)と循環参照になる(TS7022)。
  private socket: SocketController = new SocketController(this, this.meeting);
  private geo = new GeoController(this, this.map);
  private session = new RoomSessionController(this, this.map, this.geo);

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
  /** 状態のマージ + 購読者通知。コントローラと renderVals のハンドラからも使う(EngineCore)。 */
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

  // ── WebSocket 実配線(SocketController へ委譲。issue #1)──
  attachSocket = this.socket.attachSocket;
  joinMessage = this.socket.joinMessage;
  setSocketStatus = this.socket.setSocketStatus;
  onServerMsg = this.socket.onServerMsg;
  /** WS 送信(EngineCore として各コントローラから使う)。 */
  send = this.socket.send;
  sendMeeting = this.socket.sendMeeting;

  // ── geolocation(GeoController へ委譲。issue #2)──
  onGeoPosition = this.geo.onGeoPosition;
  onGeoDenied = this.geo.onGeoDenied;

  // ── navigation / join / share / settings(RoomSessionController へ委譲)──
  goTop = this.session.goTop;
  createRoom = this.session.createRoom;
  cancelCreate = this.session.cancelCreate;
  submitCreate = this.session.submitCreate;
  setMeetAt = this.session.setMeetAt;
  goPublic = this.session.goPublic;
  refreshPublic = this.session.refreshPublic;
  openPublicRoom = this.session.openPublicRoom;
  openRoomById = this.session.openRoomById;
  tapJoin = this.session.tapJoin;
  enterRoom = this.session.enterRoom;
  permAllow = this.session.permAllow;
  permDeny = this.session.permDeny;
  joinViewer = this.session.joinViewer;
  sharePosAgain = this.session.sharePosAgain;
  shareUrl = this.session.shareUrl;
  copyLink = this.session.copyLink;
  webShare = this.session.webShare;
  pickPrivate = this.session.pickPrivate;
  pickPublic = this.session.pickPublic;
  confirmPublic = this.session.confirmPublic;
  cancelPublic = this.session.cancelPublic;
  tapLeave = this.session.tapLeave;
  cancelLeave = this.session.cancelLeave;
  doLeave = this.session.doLeave;

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

  // ── building panel(BuildingController へ委譲)──
  pickBuilding = this.building.pickBuilding;
  toggleFloor = this.building.toggleFloor;
  setSelfFloor = this.building.setSelfFloor;
  pickRoom = this.building.pickRoom;
  roomMeet = this.building.roomMeet;
  roomSuggest = this.building.roomSuggest;
  spotMeet = this.building.spotMeet;

  // ── meeting point(MeetingController へ委譲)──
  setMeeting = this.meeting.setMeeting;
  clearMeeting = this.meeting.clearMeeting;
  meetingLabelOf = this.meeting.meetingLabelOf;
  resolveMeetingPos = this.meeting.resolveMeetingPos;
  startPick = this.meeting.startPick;
  cancelPick = this.meeting.cancelPick;
  cancelPin = this.meeting.cancelPin;
  confirmPin = this.meeting.confirmPin;
  mtPickMember = this.meeting.mtPickMember;
  mtPickPlace = this.meeting.mtPickPlace;
  mtApply = this.meeting.mtApply;
  adoptSuggestion = this.meeting.adoptSuggestion;
  toggleAdd = this.meeting.toggleAdd;
  submitAdd = this.meeting.submitAdd;

  // ── render helpers ──
  // 派生値の計算は engine/renderVals.ts に切り出し(プロトタイプと同名。issue #74)。
  renderVals(): RoomVals {
    return renderVals(this);
  }
}

export type { RoomVals } from "./engine/renderVals";
