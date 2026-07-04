// WS / REST メッセージ契約(TS 側)。docs/02 §4 の方針どおり server(Pydantic)と二重定義になるため、
// dev-docs §5/§6 + docs/05 §6 を単一の真実として突き合わせる。変更時は server/app/models.py と同PRで更新する。
//
// ※ 本アプリのデモはシミュレーションで自走するため、これらの型は現状「バックエンド雛形との契約」用。
//    実配線(useRoomSocket / api.ts)を有効化する際に使用する。

import type { AreaId } from "./campus";

/** 集合場所(サーバ契約版・docs/05 §4)。フロント内部表現(campus.ts の MeetingPoint)と対応。 */
export type PlaceRef =
  | { type: "classroom"; roomId: string }
  | { type: "building_spot"; spotId: string };

export type MeetingPointMsg =
  | { kind: "coords"; area: AreaId; lat: number; lng: number }
  | { kind: "member"; memberId: string }
  | { kind: "place"; place: PlaceRef };

// ── REST ──────────────────────────────────────────────
export type Visibility = "private" | "public";

export interface CreateRoomReq {
  title?: string;
  visibility?: Visibility;
}
export interface CreateRoomRes {
  room_id: string;
  host_token: string;
  expires_at: string;
  visibility: Visibility;
}
export interface RoomStatusRes {
  status: "active";
  expires_at: string;
}
export interface PublicRoomRes {
  room_id: string;
  title: string;
  members: number;
  expires_at: string;
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
  | { type: "room_expired" };
