from fastapi.testclient import TestClient

from app import rooms as rooms_mod
from app.main import app

client = TestClient(app)

# 満員(room_full)の分岐は #7 に委譲するため、本ファイルでは扱わない。


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
        # meeting_point は型付きモデル(MPMember)で保持。送出 JSON 相当を検証する。
        assert rooms_mod.get_room(rid).meeting_point.model_dump() == {
            "kind": "member",
            "memberId": target_id,
        }

    # 集合先のあき本人が退出 → 解除される(再参加者に stale な追従が渡らない)
    assert rooms_mod.get_room(rid).meeting_point is None


def test_ws_floor_updates_member_and_broadcasts():
    """floor 送信 → member の building_id / floor が更新され member_update が流れる。"""
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]

    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "ふみ", "building_id": None, "floor": None})
        ws.receive_json()  # room_state

        ws.send_json({"type": "floor", "building_id": "B1", "floor": "3"})
        upd = ws.receive_json()
        assert upd["type"] == "member_update"
        assert upd["member"]["building_id"] == "B1"
        assert upd["member"]["floor"] == "3"
        assert rooms_mod.get_room(rid).members[upd["member"]["id"]].floor == "3"


def test_ws_add_place_suggestion_broadcasts_and_dedups():
    """add_place_suggestion → place_suggestions を broadcast。同一 place の重複追加は拒否(#86)。"""
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]
    place = {"type": "classroom", "roomId": "R101"}

    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "けい", "building_id": None, "floor": None})
        ws.receive_json()  # room_state

        # 初回追加 → place_suggestions が broadcast される
        ws.send_json({"type": "add_place_suggestion", "place": place, "note": "ここ集合"})
        res = ws.receive_json()
        assert res["type"] == "place_suggestions"
        assert len(res["items"]) == 1
        assert res["items"][0]["place"] == place
        assert res["items"][0]["note"] == "ここ集合"

        # 同一 place の重複追加は拒否され broadcast されない(#86)。
        # 拒否を確認するため続けて floor を送り、次の受信が place_suggestions ではなく
        # member_update であること(=重複の broadcast が挟まらない)を見る。
        ws.send_json({"type": "add_place_suggestion", "place": place, "note": "重複"})
        ws.send_json({"type": "floor", "building_id": None, "floor": "2"})
        nxt = ws.receive_json()
        assert nxt["type"] == "member_update"
        assert len(rooms_mod.get_room(rid).place_suggestions) == 1


def test_ws_add_place_suggestion_building_spot_broadcasts_and_dedups():
    """building_spot 種別の集合場所提案も追加・重複拒否できる(型付き化での回帰防止)。

    旧実装は重複判定で `msg.place.roomId` を参照しており、roomId を持たない
    building_spot 提案では AttributeError でクラッシュしていた(#96 で解消)。
    dedup は place のモデル等価(building_spot では spotId 単位)で行う。
    """
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]
    spot = {"type": "building_spot", "spotId": "s1"}

    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "そう", "building_id": None, "floor": None})
        ws.receive_json()  # room_state

        # 初回追加 → place_suggestions が broadcast される(旧コードならクラッシュしていた経路)
        ws.send_json({"type": "add_place_suggestion", "place": spot, "note": "この広場"})
        res = ws.receive_json()
        assert res["type"] == "place_suggestions"
        assert len(res["items"]) == 1
        assert res["items"][0]["place"] == spot
        assert res["items"][0]["note"] == "この広場"

        # 同一 spotId の重複追加は拒否され broadcast されない。
        # 拒否を確認するため続けて floor を送り、次の受信が place_suggestions ではなく
        # member_update であること(=重複の broadcast が挟まらない)を見る。
        ws.send_json({"type": "add_place_suggestion", "place": spot, "note": "重複"})
        ws.send_json({"type": "floor", "building_id": None, "floor": "5"})
        nxt = ws.receive_json()
        assert nxt["type"] == "member_update"
        assert len(rooms_mod.get_room(rid).place_suggestions) == 1

        # 別 spotId は追加される(dedup が spotId 単位であること)
        ws.send_json(
            {"type": "add_place_suggestion", "place": {"type": "building_spot", "spotId": "s2"}}
        )
        res2 = ws.receive_json()
        assert res2["type"] == "place_suggestions"
        assert len(res2["items"]) == 2


def test_ws_leave_broadcasts_member_left_and_removes_member():
    """leave 送信 → member_left が broadcast され、ルームから当該 member が除去される。"""
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]

    with client.websocket_connect(f"/ws/{rid}") as ws_a:
        ws_a.send_json({"type": "join", "name": "あお", "building_id": None, "floor": None})
        ws_a.receive_json()  # room_state

        with client.websocket_connect(f"/ws/{rid}") as ws_b:
            ws_b.send_json({"type": "join", "name": "みどり", "building_id": None, "floor": None})
            b_id = ws_b.receive_json()["self_id"]  # room_state
            ws_a.receive_json()  # member_joined
            assert len(rooms_mod.get_room(rid).members) == 2

            # みどりが leave → member_left が他メンバーへ broadcast される
            ws_b.send_json({"type": "leave"})
            left = ws_a.receive_json()
            assert left["type"] == "member_left"
            assert left["id"] == b_id

        # leave した member はルームから除去されている
        assert b_id not in rooms_mod.get_room(rid).members
        assert len(rooms_mod.get_room(rid).members) == 1


def test_ws_invalid_message_is_ignored_and_connection_survives():
    """未知 type / 不正 payload は無視され、接続は落ちない(docs/02 §5)。"""
    rooms_mod.clear()
    rid = client.post("/api/rooms", json={}).json()["room_id"]

    with client.websocket_connect(f"/ws/{rid}") as ws:
        ws.send_json({"type": "join", "name": "そら", "building_id": None, "floor": None})
        ws.receive_json()  # room_state

        # 未知 type と不正 payload(lat 範囲外)はどちらも parse で弾かれ、無視される
        ws.send_json({"type": "totally_unknown", "foo": 1})
        ws.send_json({"type": "position", "lat": 999, "lng": 0})

        # 直後に正常な position を送ると member_update が返る = 接続が生きている
        ws.send_json({"type": "position", "lat": 35.0, "lng": 139.0})
        upd = ws.receive_json()
        assert upd["type"] == "member_update"
        assert upd["member"]["lat"] == 35.0
