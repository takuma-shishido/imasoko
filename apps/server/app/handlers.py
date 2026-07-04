"""WSメッセージ処理(join/position/floor/meeting_point/add_place_suggestion/leave)。担当:初心者C。

dev-docs §6 + docs/05 §6。位置は最新値のみ保持(履歴なし)。
"""

import uuid

from pydantic import TypeAdapter

from .models import (
    AddPlaceSuggestionMsg,
    ClientMsg,
    FloorMsg,
    LeaveMsg,
    MeetingPointMsg,
    PositionMsg,
)
from .rooms import Room, now
from .ws import ConnectionManager

_client_adapter: TypeAdapter = TypeAdapter(ClientMsg)


def parse_client(data: dict):
    """dict → ClientMsg(不正なら例外)。"""
    return _client_adapter.validate_python(data)


async def handle(manager: ConnectionManager, room: Room, member_id: str, msg) -> bool:
    """1メッセージを処理する。False を返したら切断(leave)。"""
    member = room.members.get(member_id)
    if member is None:
        return True

    if isinstance(msg, PositionMsg):
        member.lat = msg.lat
        member.lng = msg.lng
        member.updated_at = now()
        await manager.broadcast(room.room_id, {"type": "member_update", "member": member.to_dict()})

    elif isinstance(msg, FloorMsg):
        member.building_id = msg.building_id
        member.floor = msg.floor
        member.updated_at = now()
        await manager.broadcast(room.room_id, {"type": "member_update", "member": member.to_dict()})

    elif isinstance(msg, MeetingPointMsg):
        room.meeting_point = msg.point.model_dump() if msg.point else None
        await manager.broadcast(
            room.room_id, {"type": "meeting_point", "point": room.meeting_point}
        )

    elif isinstance(msg, AddPlaceSuggestionMsg):
        room.place_suggestions.append(
            {
                "id": uuid.uuid4().hex[:8],
                "place": msg.place.model_dump(),
                "note": msg.note or "",
                "addedBy": member_id,
                "createdAt": now().isoformat(),
            }
        )
        await manager.broadcast(
            room.room_id, {"type": "place_suggestions", "items": room.place_suggestions}
        )

    elif isinstance(msg, LeaveMsg):
        return False

    return True
