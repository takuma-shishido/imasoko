"""ルーム関連 REST エンドポイント(作成 / 取得 / public / visibility)。

dev-docs §5 / docs/05 §6。ドメイン層(app.rooms)の RoomError をここで HTTP 400 に変換する。
"""

import logging

from fastapi import APIRouter, Header, HTTPException

from .. import rooms
from ..models import CreateRoomReq, CreateRoomRes, UpdateRoomReq

router = APIRouter()


@router.post("/api/rooms", response_model=CreateRoomRes)
def create_room(req: CreateRoomReq) -> CreateRoomRes:
    try:
        room = rooms.create_room(req.title or "", req.visibility, req.meet_at)
    except rooms.RoomError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    logging.info(f"部屋が作成されました: room_id={room.room_id}, title={room.title}")
    return CreateRoomRes(**rooms.create_room_wire(room))


@router.get("/api/rooms/public")
def public_rooms() -> list[dict]:
    return [rooms.public_room_wire(r) for r in rooms.list_public()]


@router.get("/api/rooms/{room_id}")
def room_status(room_id: str) -> dict:
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="not found")
    if rooms.is_expired(room):
        raise HTTPException(status_code=410, detail="gone")
    # 退出→再参加で UI が公開範囲を復元できるよう visibility も返す(issue #35)。
    return rooms.room_status_wire(room)


@router.patch("/api/rooms/{room_id}")
def patch_room(
    room_id: str, body: UpdateRoomReq, x_host_token: str | None = Header(default=None)
) -> dict:
    """ルームの部分更新(visibility / title。host のみ。issue #166)。

    旧 `PATCH /api/rooms/{room_id}/visibility` は公開範囲変更とリネームを1エンドポイントで
    兼務していたため、部分更新 API として整理した(指定フィールドだけ変更)。
    """
    room = rooms.get_room(room_id)
    if room is None or rooms.is_expired(room):
        raise HTTPException(status_code=404, detail="not found")
    if not x_host_token or x_host_token != room.host_token:
        raise HTTPException(status_code=403, detail="forbidden")
    rooms.update_room(room, body.visibility, body.title)
    return {"visibility": room.visibility, "title": room.title}
