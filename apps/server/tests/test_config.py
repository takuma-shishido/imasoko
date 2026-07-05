from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_get_config_returns_settings():
    res = client.get("/api/config")
    assert res.status_code == 200

    body = res.json()
    assert body == {
        "end_offset_seconds": settings.end_offset_seconds,
        "max_name_length": settings.max_name_length,
        "max_members_per_room": settings.max_members_per_room,
    }


def test_get_config_end_offset_is_3h():
    # 有効期限モデル:集合時間 +3h(issue #4・front END_OFFSET と一致)
    body = client.get("/api/config").json()
    assert body["end_offset_seconds"] == 3 * 3600
