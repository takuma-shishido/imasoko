from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app import rooms as rooms_mod
from app.main import app

client = TestClient(app)

END_OFFSET = timedelta(hours=3)  # 集合時間 +3h(issue #4・front END_OFFSET と一致)


def setup_function() -> None:
    rooms_mod.clear()


def test_expires_at_is_meet_at_plus_3h():
    # 日付経過で「meet_at is too old」400 にならないよう、現在時刻基準の未来日時にする(issue #89)。
    meet_at = (rooms_mod.now() + timedelta(days=1)).replace(second=0, microsecond=0)
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


def test_meet_at_too_old_returns_400():
    # 集合時間 +3h を過ぎた過去日時を送ると 400(ドメイン例外を route が変換・issue #91)。
    old = (rooms_mod.now() - END_OFFSET - timedelta(minutes=1)).isoformat()
    res = client.post("/api/rooms", json={"meet_at": old})
    assert res.status_code == 400
    assert res.json()["detail"] == "meet_at is too old"


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
    assert client.patch(f"/api/rooms/{rid}", json={"visibility": "public"}).status_code == 403

    # host_token 付きで公開 → 一覧に載る
    ok = client.patch(
        f"/api/rooms/{rid}",
        json={"visibility": "public"},
        headers={"x-host-token": token},
    )
    assert ok.status_code == 200
    pub = client.get("/api/rooms/public").json()
    assert len(pub) == 1 and pub[0]["room_id"] == rid


def test_public_list_sorted_by_meet_at():
    # 公開ルーム一覧は集合時間(meet_at)の早い順(issue #76)。
    # わざと「遅い → 早い」の順で作成し、作成順の素通しでは通らないようにする。
    # 期限切れ(meet_at + 3h 経過)で一覧から消えないよう、現在時刻を基準にする。
    base = rooms_mod.now()
    for hours in (3, 1, 2):
        body = client.post(
            "/api/rooms",
            json={"title": f"t+{hours}h", "meet_at": (base + timedelta(hours=hours)).isoformat()},
        ).json()
        client.patch(
            f"/api/rooms/{body['room_id']}",
            json={"visibility": "public"},
            headers={"x-host-token": body["host_token"]},
        )

    pub = client.get("/api/rooms/public").json()
    assert [r["title"] for r in pub] == ["t+1h", "t+2h", "t+3h"]


def test_room_status_returns_visibility():
    # GET /api/rooms/{id} が visibility を返し、退出→再参加で公開範囲を復元できること(issue #35)。
    body = client.post("/api/rooms", json={"title": "テスト"}).json()
    rid, token = body["room_id"], body["host_token"]

    # 作成直後は private
    assert client.get(f"/api/rooms/{rid}").json()["visibility"] == "private"

    # host_token 付きで public に変更 → GET も public を返す(サーバー保持値と一致)
    client.patch(
        f"/api/rooms/{rid}",
        json={"visibility": "public"},
        headers={"x-host-token": token},
    )
    assert client.get(f"/api/rooms/{rid}").json()["visibility"] == "public"


def test_room_status_returns_title():
    # GET /api/rooms/{id} が title を返し、URL で開き直したセッションがルーム名を復元できること。
    # (これが無いと、名前を変更しても開き直したセッションには反映されない)
    body = client.post("/api/rooms", json={"title": "変更前"}).json()
    rid, token = body["room_id"], body["host_token"]
    assert client.get(f"/api/rooms/{rid}").json()["title"] == "変更前"

    # 名前を変更(PATCH /api/rooms/{id} の部分更新)→ GET に反映される
    client.patch(
        f"/api/rooms/{rid}",
        json={"visibility": "public", "title": "変更後"},
        headers={"x-host-token": token},
    )
    assert client.get(f"/api/rooms/{rid}").json()["title"] == "変更後"


def test_campus_endpoint():
    data = client.get("/api/campus").json()
    assert len(data["areas"]) == 3
    assert any(b["id"] == "b1" for b in data["buildings"])


def test_patch_room_partial_update():
    # PATCH /api/rooms/{id} は指定フィールドだけ更新する(部分更新。issue #166)。
    body = client.post("/api/rooms", json={"title": "元の名前", "visibility": "public"}).json()
    rid, token = body["room_id"], body["host_token"]
    headers = {"x-host-token": token}

    # title のみ → visibility は変わらない
    res = client.patch(f"/api/rooms/{rid}", json={"title": "新しい名前"}, headers=headers).json()
    assert res == {"visibility": "public", "title": "新しい名前"}

    # visibility のみ → title は消えない
    res = client.patch(f"/api/rooms/{rid}", json={"visibility": "private"}, headers=headers).json()
    assert res == {"visibility": "private", "title": "新しい名前"}

    # 空 body → 何も変わらず現状値を返す(no-op)
    res = client.patch(f"/api/rooms/{rid}", json={}, headers=headers).json()
    assert res == {"visibility": "private", "title": "新しい名前"}
