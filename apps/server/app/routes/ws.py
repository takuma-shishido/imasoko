"""WebSocket エンドポイント(/ws/{room_id})。dev-docs §6 / docs/05 §6。

route は accept → establish_join → 受信ループ → cleanup の薄いオーケストレーションに留め、
join 確立・切断 cleanup のロジックは handlers.py に集約する(#95)。
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import handlers, rooms
from ..models import MsgType
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
        manager.remove(room_id, member.id)
        room.members.pop(member.id, None)
        # 退出者が集合先(member 追従)なら stale な meeting_point を解除する(issue #37)。
        # 最後の位置(coords)への固定は area を解決できる web 側(残メンバーの代表)が行い、
        # ここでの解除は全員退出後の再参加・途中参加が「存在しないメンバー追従」を
        # 受け取らないための保険。broadcast はしない:接続中のクライアントは member_left で
        # 各自固定済みで、null を流すとそれを上書きしてしまう。
        mp = room.meeting_point
        if mp and mp.get("kind") == "member" and mp.get("memberId") == member.id:
            room.meeting_point = None
        await manager.broadcast(room_id, {"type": MsgType.MEMBER_LEFT, "id": member.id})
