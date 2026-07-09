"""SPA / 静的ファイル配信(本番:apps/web の dist を static_dir にコピー)。

router は常に定義するが、include するかは create_app() 側で STATIC_PATH.exists() により判定する
(従来 main.py の `if STATIC_PATH.exists():` ガードと同じ挙動)。
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..config import settings

# app/routes/spa.py → parent(routes) → parent(app) → parent(apps/server) / static_dir
STATIC_PATH = Path(__file__).resolve().parent.parent.parent / settings.static_dir

router = APIRouter()


@router.get("/{full_path:path}")
async def spa_fallback(full_path: str) -> FileResponse:
    candidate = STATIC_PATH / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    index = STATIC_PATH / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="not found")
