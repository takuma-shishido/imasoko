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
