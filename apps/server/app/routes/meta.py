"""メタ情報エンドポイント(config / health)。"""

from fastapi import APIRouter

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
    return {"status": "ok"}
