"""有効期限チェック・掃除タスク。担当:初心者B(dev-docs §8 / docs/02 §2)。

期限切れルームを検出し、`room_expired` を全員に送って切断・削除する。
"""

import asyncio

from . import rooms
from .config import settings
from .ws import manager


async def cleanup_once() -> int:
    """期限切れルームを掃除し、掃除件数を返す。"""
    removed = 0
    for room in rooms.all_rooms():
        if rooms.is_expired(room):
            await manager.broadcast(room.room_id, {"type": "room_expired"})
            for _member_id, ws in manager.members_ws(room.room_id):
                try:
                    await ws.close()
                except Exception:
                    pass
            manager.active.pop(room.room_id, None)
            rooms.delete_room(room.room_id)
            removed += 1
    return removed


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(settings.cleanup_interval_seconds)
        try:
            await cleanup_once()
        except Exception:
            pass
