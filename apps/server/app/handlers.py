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
    MsgType,
    PositionMsg,
)
from .rooms import Room, now
from .ws import ConnectionManager

_client_adapter: TypeAdapter = TypeAdapter(ClientMsg)


def parse_client(data: dict):
    """dict → ClientMsg(不正なら例外)。"""
    return _client_adapter.validate_python(data)


async def _broadcast_member_update(manager: ConnectionManager, room: Room, member) -> None:
    """member の updated_at を更新し member_update を全員へ broadcast する。

    position(位置)/ floor(建物・階)更新で共通の後処理(dev-docs §6)。
    """
    member.updated_at = now()
    await manager.broadcast(
        room.room_id, {"type": MsgType.MEMBER_UPDATE, "member": member.to_dict()}
    )


async def handle(manager: ConnectionManager, room: Room, member_id: str, msg) -> bool:
    """1メッセージを処理する。False を返したら切断(leave)。"""
    member = room.members.get(member_id)
    if member is None:
        return True

    if isinstance(msg, PositionMsg):
        member.lat = msg.lat
        member.lng = msg.lng
        await _broadcast_member_update(manager, room, member)

    elif isinstance(msg, FloorMsg):
        member.building_id = msg.building_id
        member.floor = msg.floor
        await _broadcast_member_update(manager, room, member)

    elif isinstance(msg, MeetingPointMsg):
        room.meeting_point = msg.point.model_dump() if msg.point else None
        await manager.broadcast(
            room.room_id, {"type": MsgType.MEETING_POINT, "point": room.meeting_point}
        )

    elif isinstance(msg, AddPlaceSuggestionMsg):
        already_exists = False
        for item in room.place_suggestions:
            if item["place"].get("roomId") == msg.place.roomId:
                already_exists = True
                break

        if already_exists:
            return True

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
            room.room_id, {"type": MsgType.PLACE_SUGGESTIONS, "items": room.place_suggestions}
        )

    elif isinstance(msg, LeaveMsg):
        return False

    return True
