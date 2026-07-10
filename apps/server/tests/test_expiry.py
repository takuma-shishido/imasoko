import asyncio
from datetime import timedelta

from app import expiry
from app import rooms as rooms_mod


def test_cleanup_removes_expired():
    rooms_mod.clear()
    room = rooms_mod.create_room("t", "private")
    room.expires_at = rooms_mod.now() - timedelta(seconds=1)

    removed = asyncio.run(expiry.cleanup_once())
    assert removed == 1
    assert rooms_mod.get_room(room.room_id) is None


def test_cleanup_keeps_active():
    rooms_mod.clear()
    room = rooms_mod.create_room("t", "private")
    removed = asyncio.run(expiry.cleanup_once())
    assert removed == 0
    assert rooms_mod.get_room(room.room_id) is not None
