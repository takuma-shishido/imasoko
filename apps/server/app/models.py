"""WS / REST メッセージの Pydantic モデル(docs/02 §4)。

dev-docs §5/§6 + docs/05 §6 を単一の真実として、web(apps/web/src/types/messages.ts)と対応させる。
変更時は web/server を同じPRで揃える。
"""

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field

Visibility = Literal["private", "public"]


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


# ── client → server ────────────────────────────────────
class JoinMsg(BaseModel):
    type: Literal["join"]
    name: str = Field(min_length=1, max_length=20)
    building_id: Optional[str] = None
    floor: Optional[str] = None


class PositionMsg(BaseModel):
    type: Literal["position"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: Optional[float] = None


class FloorMsg(BaseModel):
    type: Literal["floor"]
    building_id: Optional[str] = None
    floor: Optional[str] = None


class MeetingPointMsg(BaseModel):
    type: Literal["meeting_point"]
    point: Optional[MeetingPoint] = None


class AddPlaceSuggestionMsg(BaseModel):
    type: Literal["add_place_suggestion"]
    place: PlaceRef
    note: Optional[str] = None


class LeaveMsg(BaseModel):
    type: Literal["leave"]


ClientMsg = Annotated[
    Union[JoinMsg, PositionMsg, FloorMsg, MeetingPointMsg, AddPlaceSuggestionMsg, LeaveMsg],
    Field(discriminator="type"),
]


# ── REST ────────────────────────────────────────────────
class CreateRoomReq(BaseModel):
    title: Optional[str] = None
    visibility: Visibility = "private"


class CreateRoomRes(BaseModel):
    room_id: str
    host_token: str
    expires_at: str
    visibility: Visibility


class VisibilityReq(BaseModel):
    visibility: Visibility
    title: Optional[str] = None
