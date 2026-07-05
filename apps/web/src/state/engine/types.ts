// RoomEngine の状態型と初期値(issue #74 で RoomEngine.ts から切り出し)。
// エンジン本体(../RoomEngine.ts)と役割別コントローラ(engine/*)が共有する。

import type {
  AreaId,
  DemoRoom,
  MeetingPoint,
  Member,
  PlaceSuggestion,
  Toast,
} from "@/types/campus";
import type { ClientMsg } from "@/types/messages";
import { getName } from "@/lib/api";

export type Screen = "top" | "public" | "join" | "map" | "expired" | "ended" | "notfound" | "full";
export type SheetName = "members" | "building" | "meeting" | "share" | "settings";
export type Visibility = "private" | "public";

export interface View {
  tx: number;
  ty: number;
  k: number;
}
export interface PendingPin {
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

export type Patch = Partial<State> | ((s: State) => Partial<State>);

/**
 * 役割別コントローラ(engine/*Controller.ts)から見たエンジン本体(RoomEngine が実装)。
 * コントローラは state の読み取りとこのインターフェースだけに依存する
 * (send / sendMeeting の実体は SocketController で、RoomEngine 経由で共有する)。
 */
export interface EngineCore {
  readonly state: State;
  setState(patch: Patch, cb?: () => void): void;
  toast(msg: string): void;
  /** WebSocket 送信(未接続時は何もしない)。 */
  send(msg: ClientMsg): void;
  /** meeting_point の送信。接続中は自分への echo を 1 回だけ無視する(自己設定の上書き防止)。 */
  sendMeeting(point: MeetingPoint | null): void;
}

export function initialState(): State {
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
