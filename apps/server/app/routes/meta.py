"""メタ情報エンドポイント(config / health)。"""

from fastapi import APIRouter

from .. import rooms
from ..config import settings

router = APIRouter()


@router.get("/api/config")
def get_config() -> dict:
    return {
        "end_offset_seconds": settings.end_offset_seconds,
        "max_name_length": settings.max_name_length,
        "max_members_per_room": settings.max_members_per_room,
    }


@router.get("/api/health")
def get_health() -> dict:
    """死活情報 + 稼働状況(期限切れでないルーム数と、その参加人数の合計。issue #10)。"""
    active_rooms = 0
    total_members = 0
    for room in rooms.all_rooms():
        if not rooms.is_expired(room):
            active_rooms += 1
            total_members += len(room.members)
    return {"status": "ok", "active_rooms": active_rooms, "total_members": total_members}
