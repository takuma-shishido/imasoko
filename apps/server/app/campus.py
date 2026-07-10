"""キャンパスマスタ読込・GET /api/campus。担当:初心者B(docs/05 §2・§5)。

buildings.json(建物→階→教室 + ランドマーク)と classrooms.csv(空き情報)をメモリロードする。
将来 公式の空き時間データへ差し替える際は、この load_campus() 1関数を差し替えればよい(docs/05 §5)。
"""

import csv
import json
from functools import lru_cache
from pathlib import Path

from .models import Classroom, ClassroomTimeRange

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

AREAS = [
    {"id": "station_1", "name": "国際展示場駅"},
    {"id": "station_2", "name": "東京テレポート駅"},
    {"id": "campus", "name": "有明キャンパス"},
]


def _parse_available(raw: str) -> list[ClassroomTimeRange]:
    """ "00:00-08:50/10:30-13:10" 形式の空き時間帯を構造化する(不正な区間は無視)。"""
    ranges = []
    for part in raw.split("/"):
        start, sep, end = part.partition("-")
        if sep and start and end:
            ranges.append(ClassroomTimeRange(start=start, end=end))
    return ranges


def _classroom_from_row(row: dict) -> dict:
    """classrooms.csv の1行を Classroom へ正規化する。

    旧スキーマ(note 列・date/available なし)の行でも落ちないよう、
    欠損は capacity=0 / date="" / available=[] に倒す。
    """
    capacity_raw = (row.get("capacity") or "").strip()
    return Classroom(
        building_id=row.get("building_id") or "",
        floor=row.get("floor") or "",
        room_id=row.get("room_id") or "",
        name=row.get("name") or "",
        capacity=int(capacity_raw) if capacity_raw.isdigit() else 0,
        date=row.get("date") or "",
        available=_parse_available(row.get("available") or ""),
    ).model_dump()


@lru_cache(maxsize=1)
def load_campus() -> dict:
    buildings: list = []
    buildings_path = DATA_DIR / "buildings.json"
    if buildings_path.exists():
        try:
            buildings = json.loads(buildings_path.read_text(encoding="utf-8")).get("buildings", [])
        except Exception:
            pass

    classrooms: list = []
    csv_path = DATA_DIR / "classrooms.csv"
    if csv_path.exists():
        try:
            with csv_path.open(encoding="utf-8") as f:
                classrooms = [_classroom_from_row(row) for row in csv.DictReader(f)]
        except Exception:
            pass

    return {"areas": AREAS, "buildings": buildings, "classrooms": classrooms}
