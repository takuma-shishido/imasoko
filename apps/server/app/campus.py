"""キャンパスマスタ読込・GET /api/campus。担当:初心者B(docs/05 §2・§5)。

buildings.json(建物→階→教室 + ランドマーク)と classrooms.csv(空き情報)をメモリロードする。
将来 公式の空き時間データへ差し替える際は、この load_campus() 1関数を差し替えればよい(docs/05 §5)。
"""

import csv
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

AREAS = [
    {"id": "station_1", "name": "国際展示場駅"},
    {"id": "station_2", "name": "東京テレポート駅"},
    {"id": "campus", "name": "有明キャンパス"},
]


@lru_cache(maxsize=1)
def load_campus() -> dict:
    buildings: list = []
    buildings_path = DATA_DIR / "buildings.json"
    if buildings_path.exists():
        buildings = json.loads(buildings_path.read_text(encoding="utf-8")).get("buildings", [])

    classrooms: list = []
    csv_path = DATA_DIR / "classrooms.csv"
    if csv_path.exists():
        with csv_path.open(encoding="utf-8") as f:
            classrooms = list(csv.DictReader(f))

    return {"areas": AREAS, "buildings": buildings, "classrooms": classrooms}
