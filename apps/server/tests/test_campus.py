"""GET /api/campus とキャンパスマスタ読込のテスト(issue #141)。"""

from fastapi.testclient import TestClient

from app.campus import _classroom_from_row, _parse_available, load_campus
from app.main import app
from app.models import ClassroomTimeRange

client = TestClient(app)


def setup_function() -> None:
    load_campus.cache_clear()


# ── _parse_available ──────────────────────────────────


def test_parse_available_structures_ranges() -> None:
    assert _parse_available("00:00-08:50/10:30-13:10") == [
        ClassroomTimeRange(start="00:00", end="08:50"),
        ClassroomTimeRange(start="10:30", end="13:10"),
    ]


def test_parse_available_empty_and_invalid() -> None:
    assert _parse_available("") == []
    # 区切りだけ・時間欠けなどの不正区間は無視される
    assert _parse_available("/-/10:00-") == []


# ── _classroom_from_row ───────────────────────────────


def test_classroom_from_row_new_schema() -> None:
    row = {
        "building_id": "b1",
        "floor": "2F",
        "room_id": "b1-201",
        "name": "201",
        "capacity": "40",
        "date": "2026-07-09",
        "available": "00:00-08:50/19:00-24:00",
    }
    got = _classroom_from_row(row)
    assert got["capacity"] == 40
    assert got["date"] == "2026-07-09"
    assert got["available"] == [
        {"start": "00:00", "end": "08:50"},
        {"start": "19:00", "end": "24:00"},
    ]


def test_classroom_from_row_legacy_schema_does_not_crash() -> None:
    # 旧スキーマ(note 列・date/available なし)でも欠損を既定値に倒して読める
    row = {
        "building_id": "b1",
        "floor": "3F",
        "room_id": "b1-301",
        "name": "301",
        "capacity": "",
        "note": "当面は手入力の空き情報をnoteに",
    }
    got = _classroom_from_row(row)
    assert got["capacity"] == 0
    assert got["date"] == ""
    assert got["available"] == []
    assert "note" not in got


# ── GET /api/campus ───────────────────────────────────


def test_get_campus_returns_structured_classrooms() -> None:
    res = client.get("/api/campus")
    assert res.status_code == 200
    body = res.json()
    assert body["classrooms"], "classrooms.csv が読み込まれていること"
    room = body["classrooms"][0]
    assert set(room) == {
        "building_id",
        "floor",
        "room_id",
        "name",
        "capacity",
        "date",
        "available",
    }
    assert isinstance(room["capacity"], int)
    for rng in room["available"]:
        assert set(rng) == {"start", "end"}
