"""WebSocket エンドポイント(/ws/{room_id})。dev-docs §6 / docs/05 §6。

join / 受信ループ / 切断処理は main.py から**移設のみ**(ロジックの抽出は #95 で行う)。
"""

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import handlers, rooms
from ..config import settings
from ..models import JoinMsg
from ..rooms import Member
from ..ws import manager

router = APIRouter()


@router.websocket("/ws/{room_id}")
async def ws_endpoint(ws: WebSocket, room_id: str) -> None:
    await ws.accept()
    room = rooms.get_room(room_id)
    if room is None or rooms.is_expired(room):
        await ws.send_json({"type": "room_expired"})
        await ws.close()
        return

    # 最初のメッセージは join(dev-docs §6)
    try:
        first = await ws.receive_json()
        msg = handlers.parse_client(first)
    except Exception:
        await ws.close()
        return
    if not isinstance(msg, JoinMsg):
        await ws.close()
        return
    if len(room.members) >= settings.max_members_per_room:
        await ws.send_json({"type": "room_full"})
        await ws.close()
        return

    member_id = uuid.uuid4().hex[:8]
    member = Member(id=member_id, name=msg.name, building_id=msg.building_id, floor=msg.floor)
    room.members[member_id] = member
    manager.add(room_id, member_id, ws)

    await ws.send_json(
        {
            "type": "room_state",
            "self_id": member_id,
            "members": [m.to_dict() for m in room.members.values()],
            "meeting_point": room.meeting_point,
            "expires_at": room.expires_at.isoformat(),
        }
    )
    await manager.broadcast(
        room_id, {"type": "member_joined", "member": member.to_dict()}, exclude=member_id
    )

    try:
        while True:
            data = await ws.receive_json()
            try:
                cmsg = handlers.parse_client(data)
            except Exception:
                continue  # 不正メッセージは無視して継続(docs/02 §5)
            keep = await handlers.handle(manager, room, member_id, cmsg)
            if not keep:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(room_id, member_id)
        room.members.pop(member_id, None)
        # 退出者が集合先(member 追従)なら stale な meeting_point を解除する(issue #37)。
        # 最後の位置(coords)への固定は area を解決できる web 側(残メンバーの代表)が行い、
        # ここでの解除は全員退出後の再参加・途中参加が「存在しないメンバー追従」を
        # 受け取らないための保険。broadcast はしない:接続中のクライアントは member_left で
        # 各自固定済みで、null を流すとそれを上書きしてしまう。
        mp = room.meeting_point
        if mp and mp.get("kind") == "member" and mp.get("memberId") == member_id:
            room.meeting_point = None
        await manager.broadcast(room_id, {"type": "member_left", "id": member_id})
