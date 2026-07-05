"""WebSocket エンドポイント(/ws/{room_id})。dev-docs §6 / docs/05 §6。

route は accept → establish_join → 受信ループ → cleanup の薄いオーケストレーションに留め、
join 確立・切断 cleanup のロジックは handlers.py に集約する(#95)。
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import handlers, rooms
from ..ws import manager

router = APIRouter()


@router.websocket("/ws/{room_id}")
async def ws_endpoint(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    room = rooms.get_room(room_id)
    member = await handlers.establish_join(ws, room, manager)
    if member is None:
        return

    try:
        while True:
            data = await ws.receive_json()
            try:
                cmsg = handlers.parse_client(data)
            except Exception:
                continue  # 不正メッセージは無視して継続(docs/02 §5)
            keep = await handlers.handle(manager, room, member.id, cmsg)
            if not keep:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await handlers.cleanup_on_disconnect(room, member, manager)
