"""SPA フォールバックのパストラバーサル回帰テスト(issue #138)。

STATIC_PATH を一時ディレクトリに差し替え、static 配下の外にあるファイルを
エンコードした ../ で読み出せないことを確認する。
"""

import pathlib
import tempfile

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.routes import spa


@pytest.fixture
def client(monkeypatch):
    d = pathlib.Path(tempfile.mkdtemp())
    static = d / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>app</html>")
    (static / "app.js").write_text("console.log('ok')")
    (d / "secret.txt").write_text("TOP-SECRET")  # static の外(兄弟)

    monkeypatch.setattr(spa, "STATIC_PATH", static)
    app = FastAPI()
    app.include_router(spa.router)
    return TestClient(app)


def test_serves_static_file(client):
    res = client.get("/app.js")
    assert res.status_code == 200
    assert "console.log" in res.text


def test_unknown_path_falls_back_to_index(client):
    res = client.get("/r/some-room-id")
    assert res.status_code == 200
    assert "<html>app</html>" in res.text


@pytest.mark.parametrize(
    "path",
    [
        "/../secret.txt",
        "/..%2Fsecret.txt",
        "/%2e%2e/secret.txt",
        "/%2e%2e%2fsecret.txt",
        "/static/..%2fsecret.txt",
    ],
)
def test_path_traversal_does_not_leak_outside_static(client, path):
    res = client.get(path)
    # static 外のファイルの中身は絶対に返さない(index.html へフォールバックするのは可)。
    assert "TOP-SECRET" not in res.text
