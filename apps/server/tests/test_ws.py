from fastapi.testclient import TestClient

from app import rooms as rooms_mod
from app.main import app

client = TestClient(app)


def test_ws_join_state_and_position():
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]

    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "たくま", "building_id": None, "floor": None})
        state = ws.receive_json()
        assert state["type"] == "room_state"
        assert state["members"][0]["name"] == "たくま"

        # position 送信 → member_update がブロードキャストされる(dev-docs §6)
        ws.send_json({"type": "position", "lat": 35.63, "lng": 139.79})
        upd = ws.receive_json()
        assert upd["type"] == "member_update"
        assert upd["member"]["lat"] == 35.63


def test_ws_meeting_point():
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]
    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "さき", "building_id": None, "floor": None})
        ws.receive_json()  # room_state
        ws.send_json(
            {
                "type": "meeting_point",
                "point": {"kind": "coords", "area": "campus", "lat": 35.63, "lng": 139.79},
            }
        )
        mp = ws.receive_json()
        assert mp["type"] == "meeting_point"
        assert mp["point"]["kind"] == "coords"


def test_ws_member_left_clears_stale_member_meeting_point():
    """集合先(member 追従)の本人が退出したら stale な meeting_point を解除する(issue #37)。

    解除しないと、全員退出後の再参加・途中参加が room_state で
    「存在しないメンバーへの追従」を受け取り、集合ピンが恒久的に消える。
    """
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]

    with client.websocket_connect(f"/ws/{rid}") as ws_a:
        ws_a.send_json({"type": "join", "name": "あき", "building_id": None, "floor": None})
        target_id = ws_a.receive_json()["self_id"]  # room_state

        with client.websocket_connect(f"/ws/{rid}") as ws_b:
            ws_b.send_json({"type": "join", "name": "ゆう", "building_id": None, "floor": None})
            ws_b.receive_json()  # room_state
            ws_a.receive_json()  # member_joined

            # あき(集合先)に追従する meeting_point を設定
            ws_b.send_json(
                {"type": "meeting_point", "point": {"kind": "member", "memberId": target_id}}
            )
            assert ws_b.receive_json()["type"] == "meeting_point"
            assert ws_a.receive_json()["type"] == "meeting_point"

        # 集合先でないゆうの退出では meeting_point は変わらない
        assert ws_a.receive_json()["type"] == "member_left"
        assert rooms_mod.get_room(rid).meeting_point == {"kind": "member", "memberId": target_id}

    # 集合先のあき本人が退出 → 解除される(再参加者に stale な追従が渡らない)
    assert rooms_mod.get_room(rid).meeting_point is None
