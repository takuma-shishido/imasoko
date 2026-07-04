"""ルームの作成・取得・有効期限・公開範囲(インメモリ)。担当:初心者A(docs/01・05 §3)。

データベースは使わず、すべてサーバープロセスのメモリ上に持つ(dev-docs §1)。
本番は1ワーカー運用(docs/02 §9)。
"""

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

from .config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """naive datetime は UTC とみなす(is_expired の aware 比較で TypeError を避ける)。"""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


@dataclass
class Member:
    id: str
    name: str
    building_id: Optional[str] = None
    floor: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    updated_at: datetime = field(default_factory=now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "building_id": self.building_id,
            "floor": self.floor,
            "lat": self.lat,
            "lng": self.lng,
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class Room:
    room_id: str
    host_token: str
    title: str
    visibility: str
    created_at: datetime
    meet_at: datetime  # 集合時間(有効期限の起点・issue #4)
    expires_at: datetime
    members: dict[str, Member] = field(default_factory=dict)
    meeting_point: Optional[dict] = None
    place_suggestions: list[dict] = field(default_factory=list)


_rooms: dict[str, Room] = {}


def create_room(
    title: str = "", visibility: str = "private", meet_at: Optional[datetime] = None
) -> Room:
    room_id = secrets.token_urlsafe(settings.room_id_bytes)
    host_token = secrets.token_urlsafe(settings.host_token_bytes)
    created = now()
    # 集合時間が未指定なら作成時刻を集合時間とみなす(issue #4)
    meet = _as_utc(meet_at) if meet_at is not None else created
    room = Room(
        room_id=room_id,
        host_token=host_token,
        title=title or "",
        visibility=visibility,
        created_at=created,
        meet_at=meet,
        expires_at=meet + timedelta(seconds=settings.end_offset_seconds),
    )
    _rooms[room_id] = room
    return room


def get_room(room_id: str) -> Optional[Room]:
    return _rooms.get(room_id)


def is_expired(room: Room) -> bool:
    return now() >= room.expires_at


def delete_room(room_id: str) -> None:
    _rooms.pop(room_id, None)


def list_public() -> list[Room]:
    return [r for r in _rooms.values() if r.visibility == "public" and not is_expired(r)]


def all_rooms() -> list[Room]:
    return list(_rooms.values())


def set_visibility(room: Room, visibility: str, title: Optional[str]) -> None:
    room.visibility = visibility
    if title is not None:
        room.title = title


def clear() -> None:
    """テスト用:全ルーム削除。"""
    _rooms.clear()
