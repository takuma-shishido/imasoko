"""FastAPI エントリ・アプリファクトリ。担当:ホスト(docs/01)。

lifespan(有効期限の掃除タスク)と各 APIRouter(routes/ 配下)の組み立てを create_app() に集約する。
REST(rooms/campus/meta)+ WebSocket(/ws/{room_id})+ SPA 配信(本番は apps/web の dist を static へ)。
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import expiry
from .routes import campus, meta, rooms, spa, ws

# 動作ログ(issue #9):時刻・レベル付きで INFO 以上を出す(部屋の作成/掃除・WS 接続/切断)。
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(expiry.cleanup_loop())
    try:
        yield
    finally:
        task.cancel()


def create_app() -> FastAPI:
    app = FastAPI(title="いまそこ", lifespan=lifespan)
    app.include_router(meta.router)
    app.include_router(rooms.router)
    app.include_router(campus.router)
    app.include_router(ws.router)
    # SPA fallback は catch-all(/{full_path:path})なので必ず最後に、かつ dist がある時だけ include。
    if spa.STATIC_PATH.exists():
        app.include_router(spa.router)
    return app


app = create_app()
