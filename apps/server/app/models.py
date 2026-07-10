"""WS / REST メッセージの Pydantic モデル(docs/02 §4)。

dev-docs §5/§6 + docs/05 §6 を単一の真実として、web(apps/web/src/types/messages.ts)と対応させる。
変更時は web/server を同じPRで揃える。
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

Visibility = Literal["private", "public"]


# ── server → client メッセージ type(docs/05 §6 / web の messages.ts と一致)──
# str, Enum なので json.dumps(= ws.send_json)時に値の文字列がそのまま出力される(送出値は不変)。
class MsgType(str, Enum):
    ROOM_STATE = "room_state"
    MEMBER_JOINED = "member_joined"
    MEMBER_LEFT = "member_left"
    MEMBER_UPDATE = "member_update"
    MEETING_POINT = "meeting_point"
    PLACE_SUGGESTIONS = "place_suggestions"
    ROOM_EXPIRED = "room_expired"
    ROOM_FULL = "room_full"


# ── 集合場所(docs/05 §4)────────────────────────────────
class PlaceClassroom(BaseModel):
    type: Literal["classroom"]
    roomId: str


class PlaceBuildingSpot(BaseModel):
    type: Literal["building_spot"]
    spotId: str


PlaceRef = Annotated[Union[PlaceClassroom, PlaceBuildingSpot], Field(discriminator="type")]


class MPCoords(BaseModel):
    kind: Literal["coords"]
    area: str
    lat: float
    lng: float


class MPMember(BaseModel):
    kind: Literal["member"]
    memberId: str


class MPPlace(BaseModel):
    kind: Literal["place"]
    place: PlaceRef


MeetingPoint = Annotated[Union[MPCoords, MPMember, MPPlace], Field(discriminator="kind")]


# ── 集合場所の提案(server が id/addedBy/createdAt を採番して保持・配信する)──
# フィールド順は送出 JSON のキー順(id → place → note → addedBy → createdAt)に一致させる。
class PlaceSuggestion(BaseModel):
    id: str
    place: PlaceRef
    note: str
    addedBy: str
    createdAt: str


# ── client → server ────────────────────────────────────
class JoinMsg(BaseModel):
    type: Literal["join"]
    name: str = Field(min_length=1, max_length=20)
    building_id: str | None = None
    floor: str | None = None


class PositionMsg(BaseModel):
    type: Literal["position"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = None


class FloorMsg(BaseModel):
    type: Literal["floor"]
    building_id: str | None = None
    floor: str | None = None


class MeetingPointMsg(BaseModel):
    type: Literal["meeting_point"]
    point: MeetingPoint | None = None


class AddPlaceSuggestionMsg(BaseModel):
    type: Literal["add_place_suggestion"]
    place: PlaceRef
    note: str | None = None


class LeaveMsg(BaseModel):
    type: Literal["leave"]


ClientMsg = Annotated[
    Union[JoinMsg, PositionMsg, FloorMsg, MeetingPointMsg, AddPlaceSuggestionMsg, LeaveMsg],
    Field(discriminator="type"),
]


# ── REST ────────────────────────────────────────────────
# 教室の空き時間帯("10:30-13:10" を start/end に分解したもの。docs/05 §5)
class ClassroomTimeRange(BaseModel):
    start: str  # "HH:MM"
    end: str  # "HH:MM"


# GET /api/campus の classrooms[] 1件(classrooms.csv 由来・web の CampusClassroom と一致)
class Classroom(BaseModel):
    building_id: str
    floor: str
    room_id: str
    name: str
    capacity: int
    date: str  # 空き情報のエクスポート対象日(YYYY-MM-DD)。無ければ ""
    available: list[ClassroomTimeRange]


class CreateRoomReq(BaseModel):
    title: str | None = None
    visibility: Visibility = "private"
    # 集合時間(ISO 8601)。未指定なら作成時刻を集合時間とみなす(issue #4)
    meet_at: datetime | None = None


class CreateRoomRes(BaseModel):
    room_id: str
    host_token: str
    meet_at: str  # 集合時間(有効期限の起点)
    expires_at: str  # = meet_at + 3h(front END_OFFSET と一致)
    visibility: Visibility


class UpdateRoomReq(BaseModel):
    """PATCH /api/rooms/{room_id} の部分更新(指定したフィールドだけ変更する。issue #166)。"""

    visibility: Visibility | None = None
    title: str | None = None


# ── server → client メッセージ(手組み生 dict を型付きに置換・web の messages.ts と対応)──
# 送出 JSON は従来の生 dict と厳密一致させる:
#   - フィールド定義順 = 送出キー順(type を先頭)。
#   - model_dump()(mode="python")の既定を使い、None フィールドも欠落させない(exclude_none しない)。
#   - member 表現は Member.to_dict() を単一の真実とし、envelope 側は dict のまま受け渡す。
class RoomStateMsg(BaseModel):
    type: MsgType = MsgType.ROOM_STATE
    self_id: str
    members: list[dict]
    meeting_point: MeetingPoint | None = None
    expires_at: str


class MemberJoinedMsg(BaseModel):
    type: MsgType = MsgType.MEMBER_JOINED
    member: dict


class MemberUpdateMsg(BaseModel):
    type: MsgType = MsgType.MEMBER_UPDATE
    member: dict


class MemberLeftMsg(BaseModel):
    type: MsgType = MsgType.MEMBER_LEFT
    id: str


class MeetingPointBroadcastMsg(BaseModel):
    type: MsgType = MsgType.MEETING_POINT
    point: MeetingPoint | None = None


class PlaceSuggestionsMsg(BaseModel):
    type: MsgType = MsgType.PLACE_SUGGESTIONS
    items: list[PlaceSuggestion]


class RoomExpiredMsg(BaseModel):
    type: MsgType = MsgType.ROOM_EXPIRED


class RoomFullMsg(BaseModel):
    type: MsgType = MsgType.ROOM_FULL
