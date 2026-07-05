"""FastAPIエントリ・ルーティング・静的配信。担当:ホスト(docs/01)。

REST(rooms/campus)+ WebSocket(/ws/{room_id})+ SPA 配信(本番は apps/web の dist を static へ)。
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from . import campus, expiry, handlers, rooms
from .config import settings
from .models import CreateRoomReq, CreateRoomRes, JoinMsg, VisibilityReq
from .rooms import Member
from .ws import manager

STATIC_PATH = Path(__file__).resolve().parent.parent / settings.static_dir


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(expiry.cleanup_loop())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(title="いまそこ", lifespan=lifespan)


@app.get("/api/config")
def get_config() -> dict:
    return {
        "end_offset_seconds": settings.end_offset_seconds,
        "max_name_length": settings.max_name_length,
        "max_members_per_room": settings.max_members_per_room,
    }


@app.get("/api/health")
def get_health() -> dict:
    return {"status": "ok"}


# ── REST(dev-docs §5 / docs/05 §6)────────────────────
@app.post("/api/rooms", response_model=CreateRoomRes)
def create_room(req: CreateRoomReq) -> CreateRoomRes:
    try:
        room = rooms.create_room(req.title or "", req.visibility, req.meet_at)
    except rooms.RoomError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return CreateRoomRes(
        room_id=room.room_id,
        host_token=room.host_token,
        meet_at=room.meet_at.isoformat(),
        expires_at=room.expires_at.isoformat(),
        visibility=room.visibility,  # type: ignore[arg-type]
    )


@app.get("/api/rooms/public")
def public_rooms() -> list[dict]:
    return [
        {
            "room_id": r.room_id,
            "title": r.title or "無名のルーム",
            "members": len(r.members),
            "expires_at": r.expires_at.isoformat(),
        }
        for r in rooms.list_public()
    ]


@app.get("/api/rooms/{room_id}")
def room_status(room_id: str) -> dict:
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="not found")
    if rooms.is_expired(room):
        raise HTTPException(status_code=410, detail="gone")
    # 退出→再参加で UI が公開範囲を復元できるよう visibility も返す(issue #35)。
    return {
        "status": "active",
        "expires_at": room.expires_at.isoformat(),
        "visibility": room.visibility,
    }


@app.patch("/api/rooms/{room_id}/visibility")
def patch_visibility(
    room_id: str, body: VisibilityReq, x_host_token: str | None = Header(default=None)
) -> dict:
    room = rooms.get_room(room_id)
    if room is None or rooms.is_expired(room):
        raise HTTPException(status_code=404, detail="not found")
    if not x_host_token or x_host_token != room.host_token:
        raise HTTPException(status_code=403, detail="forbidden")
    rooms.set_visibility(room, body.visibility, body.title)
    return {"visibility": room.visibility}


@app.get("/api/campus")
def get_campus() -> dict:
    return campus.load_campus()


# ── WebSocket(dev-docs §6 / docs/05 §6)────────────────
@app.websocket("/ws/{room_id}")
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


# ── SPA 配信(本番:apps/web の dist を static_dir にコピー)──
if STATIC_PATH.exists():

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        candidate = STATIC_PATH / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = STATIC_PATH / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="not found")
