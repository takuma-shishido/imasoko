from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app import rooms as rooms_mod
from app.main import app

client = TestClient(app)

END_OFFSET = timedelta(hours=3)  # 集合時間 +3h(issue #4・front END_OFFSET と一致)


def setup_function() -> None:
    rooms_mod.clear()


def test_expires_at_is_meet_at_plus_3h():
    meet_at = datetime(2026, 7, 4, 18, 0, tzinfo=timezone.utc)
    body = client.post("/api/rooms", json={"meet_at": meet_at.isoformat()}).json()

    assert datetime.fromisoformat(body["meet_at"]) == meet_at
    assert datetime.fromisoformat(body["expires_at"]) == meet_at + END_OFFSET


def test_meet_at_defaults_to_creation_time():
    before = rooms_mod.now()
    body = client.post("/api/rooms", json={}).json()
    after = rooms_mod.now()

    meet_at = datetime.fromisoformat(body["meet_at"])
    assert before <= meet_at <= after
    assert datetime.fromisoformat(body["expires_at"]) == meet_at + END_OFFSET


def test_create_get_and_expire():
    res = client.post("/api/rooms", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["visibility"] == "private"
    assert body["room_id"] and body["host_token"]

    rid = body["room_id"]
    assert client.get(f"/api/rooms/{rid}").status_code == 200

    # 期限切れ → 410 Gone(dev-docs §5)
    room = rooms_mod.get_room(rid)
    assert room is not None
    room.expires_at = rooms_mod.now() - timedelta(seconds=1)
    assert client.get(f"/api/rooms/{rid}").status_code == 410


def test_unknown_room_404():
    assert client.get("/api/rooms/does-not-exist").status_code == 404


def test_public_list_and_visibility():
    body = client.post("/api/rooms", json={"title": "サッカー部 集合"}).json()
    rid, token = body["room_id"], body["host_token"]

    # 既定 private は一覧に出ない
    assert client.get("/api/rooms/public").json() == []

    # host_token 無しの公開切替は拒否(403)
    assert (
        client.patch(f"/api/rooms/{rid}/visibility", json={"visibility": "public"}).status_code
        == 403
    )

    # host_token 付きで公開 → 一覧に載る
    ok = client.patch(
        f"/api/rooms/{rid}/visibility",
        json={"visibility": "public"},
        headers={"x-host-token": token},
    )
    assert ok.status_code == 200
    pub = client.get("/api/rooms/public").json()
    assert len(pub) == 1 and pub[0]["room_id"] == rid


def test_campus_endpoint():
    data = client.get("/api/campus").json()
    assert len(data["areas"]) == 3
    assert any(b["id"] == "b1" for b in data["buildings"])
