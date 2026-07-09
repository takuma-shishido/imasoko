from datetime import timedelta

from fastapi.testclient import TestClient

from app import rooms as rooms_mod
from app.main import app
from app.rooms import Member

client = TestClient(app)


def setup_function() -> None:
    rooms_mod.clear()


def test_health_empty_state():
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "active_rooms": 0, "total_members": 0}


def test_health_counts_active_rooms_and_members():
    # 生きているルーム2つ(参加 2人 + 1人)。
    r1 = rooms_mod.create_room()
    r1.members["m1"] = Member(id="m1", name="a")
    r1.members["m2"] = Member(id="m2", name="b")
    r2 = rooms_mod.create_room()
    r2.members["m3"] = Member(id="m3", name="c")

    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["active_rooms"] == 2
    assert body["total_members"] == 3


def test_health_excludes_expired_rooms():
    # 期限切れルームのメンバーは「動いているルーム/参加中の人数」に数えない(issue #10)。
    expired = rooms_mod.create_room()
    expired.members["m1"] = Member(id="m1", name="a")
    expired.expires_at = rooms_mod.now() - timedelta(seconds=1)

    body = client.get("/api/health").json()
    assert body["active_rooms"] == 0
    assert body["total_members"] == 0
