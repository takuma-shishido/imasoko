"""キャンパス(建物・階)メタデータの配信。"""

from fastapi import APIRouter

from .. import campus

router = APIRouter()


@router.get("/api/campus")
def get_campus() -> dict:
    return campus.load_campus()
