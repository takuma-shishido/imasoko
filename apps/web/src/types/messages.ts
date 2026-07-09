// WS / REST メッセージ契約(TS 側)。docs/02 §4 の方針どおり server(Pydantic)と二重定義になるため、
// dev-docs §5/§6 + docs/05 §6 を単一の真実として突き合わせる。変更時は server/app/models.py と同PRで更新する。
//
// 実配線(useRoomSocket / api.ts)で実際に使用中のワイヤ契約。

import type { AreaId } from "./campus";

/** 集合場所(サーバ契約版・docs/05 §4)。フロント内部表現(campus.ts の MeetingPoint)と対応。 */
export type PlaceRef =
  { type: "classroom"; roomId: string } | { type: "building_spot"; spotId: string };

export type MeetingPointMsg =
  | { kind: "coords"; area: AreaId; lat: number; lng: number }
  | { kind: "member"; memberId: string }
  | { kind: "place"; place: PlaceRef };

// ── REST ──────────────────────────────────────────────
export type Visibility = "private" | "public";

export interface CreateRoomReq {
  title?: string;
  visibility?: Visibility;
  /** 集合時間(ISO 8601)。未指定なら作成時刻を集合時間とみなす(issue #4)。 */
  meet_at?: string;
}
export interface CreateRoomRes {
  room_id: string;
  host_token: string;
  /** 集合時間(有効期限の起点)。 */
  meet_at: string;
  /** = meet_at + 3h(END_OFFSET と一致)。 */
  expires_at: string;
  visibility: Visibility;
}
export interface RoomStatusRes {
  status: "active";
  expires_at: string;
  /** ルームの公開範囲。退出→再参加で UI が復元する(issue #35)。 */
  visibility: Visibility;
}
export interface PublicRoomRes {
  room_id: string;
  title: string;
  members: number;
  expires_at: string;
}

// ── Campus master (GET /api/campus・docs/07 §1.5) ──────
// server(app/campus.py の返却 = buildings.json + classrooms.csv)と齟齬なく対応させる。
export interface CampusArea {
  id: AreaId;
  name: string;
}
export interface CampusSpot {
  id: string;
  label: string;
  area: AreaId;
  lat: number;
  lng: number;
}
export interface CampusRoom {
  id: string;
  name: string;
  type?: string;
}
export interface CampusFloor {
  level: string;
  rooms: CampusRoom[];
}
export interface CampusBuilding {
  id: string;
  name: string;
  svgRegionId?: string;
  spots: CampusSpot[];
  floors: CampusFloor[];
}
/** 教室の空き時間帯(server models.py ClassroomTimeRange と一致)。 */
export interface ClassroomTimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}
export interface CampusClassroom {
  building_id: string;
  floor: string;
  room_id: string;
  name: string;
  capacity: number;
  date: string; // 空き情報のエクスポート対象日(YYYY-MM-DD)。無ければ ""
  available: ClassroomTimeRange[];
}
export interface CampusRes {
  areas: CampusArea[];
  buildings: CampusBuilding[];
  classrooms: CampusClassroom[];
}
/** GET /api/config:サーバー定数(二重管理の解消。issue #15 / server config.py)。 */
export interface ConfigRes {
  end_offset_seconds: number;
  max_name_length: number;
  max_members_per_room: number;
}

// ── WebSocket (client → server) ───────────────────────
export interface MemberState {
  id: string;
  name: string;
  building_id: string | null;
  floor: string | null;
  lat: number | null;
  lng: number | null;
  updated_at: string;
}

export type ClientMsg =
  | { type: "join"; name: string; building_id: string | null; floor: string | null }
  | { type: "position"; lat: number; lng: number; accuracy?: number }
  | { type: "floor"; building_id: string | null; floor: string | null }
  | { type: "meeting_point"; point: MeetingPointMsg | null }
  | { type: "add_place_suggestion"; place: PlaceRef; note?: string }
  | { type: "leave" };

// ── WebSocket (server → client) ───────────────────────
export type ServerMsg =
  | {
      type: "room_state";
      self_id: string;
      members: MemberState[];
      meeting_point: MeetingPointMsg | null;
      expires_at: string;
    }
  | { type: "member_joined"; member: MemberState }
  | { type: "member_update"; member: MemberState }
  | { type: "member_left"; id: string }
  | { type: "meeting_point"; point: MeetingPointMsg | null }
  | { type: "place_suggestions"; items: unknown[] }
  | { type: "room_full" }
  | { type: "room_expired" };
