"""WebSocket 接続管理(ConnectionManager 骨格)。担当:ホスト(docs/01)。

参加者リスト保持・切断処理・ブロードキャストを提供する。
メッセージ処理そのものは handlers.py(dev-docs §11)。
"""

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> { member_id -> WebSocket }
        self.active: dict[str, dict[str, WebSocket]] = {}

    def add(self, room_id: str, member_id: str, ws: WebSocket) -> None:
        self.active.setdefault(room_id, {})[member_id] = ws

    def remove(self, room_id: str, member_id: str) -> None:
        conns = self.active.get(room_id)
        if conns is not None:
            conns.pop(member_id, None)
            if not conns:
                self.active.pop(room_id, None)

    def members_ws(self, room_id: str) -> list[tuple[str, WebSocket]]:
        return list(self.active.get(room_id, {}).items())

    async def broadcast(self, room_id: str, message: dict, exclude: str | None = None) -> None:
        for member_id, ws in self.members_ws(room_id):
            if member_id == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                # 1クライアントの不調で全体を落とさない(docs/02 §5)
                pass


manager = ConnectionManager()
