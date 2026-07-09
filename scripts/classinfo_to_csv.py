#!/usr/bin/env python3
"""MUSCAT の施設予約状況ページ(HTML)を classrooms.csv(サーバー用スキーマ)に変換する。

ページ内の予約マトリクス表は 1 施設 = 1 行で、
「施設/備品名」「収容人数」「故障情報」の後に 10 分刻み(24h × 6)のセルが並ぶ。
空きセルは class に reservedColorDefault、予約済みセルは
reservedColorLecture / reservedColorOther などを持つ。

施設名 `有明１－２０１` は「1号館 201教室」を表し、`b1 / 2F / b1-201` へ変換する。
数字3桁の教室のみ対象とし、それ以外(`９Ａ` 等、機械判定できない名称)は警告して除外する。

使い方(MUSCAT の空き状況ページを HTML 保存して渡す):
    python3 scripts/classinfo_to_csv.py <入力HTML> [出力CSV]
    (出力省略時: apps/server/data/classrooms.csv)
"""

import csv
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

SLOT_MINUTES = 10
SLOTS_PER_DAY = 24 * 60 // SLOT_MINUTES

OCCUPIED_CLASSES = {
    "reservedColorLecture",
    "reservedColorOther",
    "reservedColorDuplicate",
    "reservedColorSelected",
}

# 有明<号館>-<数字3桁の教室>(NFKC 正規化後)。それ以外は機械判定できないので除外する
FACILITY_RE = re.compile(r"^有明(\d+)-(\d{3})$")


class MatrixParser(HTMLParser):
    """予約マトリクス表から (施設名, 収容人数, スロット占有状況) を集める。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []  # [{name, capacity, slots: [bool]*N}] (True = 空き)
        self.dates = set()  # data-reservedDatakey から拾った対象日 (YYYYMMDD)
        self._current = None
        self._capture_text = None  # "name" | "capacity" | None
        self._text_buf = []

    def handle_starttag(self, tag, attrs):
        if tag != "td":
            return
        attrs = dict(attrs)
        classes = set(attrs.get("class", "").split())

        if "facilityColmun" in classes:
            # 新しい施設行の開始
            self._flush_row()
            self._current = {"name": "", "capacity": "", "slots": []}
            self._capture_text = "name"
            self._text_buf = []
        elif "capacityColmun" in classes and self._current is not None:
            self._capture_text = "capacity"
            self._text_buf = []
        elif self._current is not None and any(c.startswith("hour") for c in classes):
            datakey = attrs.get("data-reserveddatakey", "").strip()
            occupied = bool(classes & OCCUPIED_CLASSES) or bool(datakey)
            self._current["slots"].append(not occupied)
            # 予約キーは "11-20260709-0850-1030-A1201-1928306" 形式。2番目が対象日
            if datakey:
                parts = datakey.split("-")
                if len(parts) >= 2 and re.fullmatch(r"\d{8}", parts[1]):
                    self.dates.add(parts[1])

    # セルは <td ... /> の自己閉じ形式なので startendtag も同様に扱う
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "td" and self._capture_text:
            key = self._capture_text
            self._current[key] = " ".join("".join(self._text_buf).split())
            self._capture_text = None
        elif tag == "table":
            self._flush_row()

    def handle_data(self, data):
        if self._capture_text:
            self._text_buf.append(data)

    def _flush_row(self):
        if self._current and self._current["name"]:
            self.rows.append(self._current)
        self._current = None


def slots_to_ranges(slots):
    """空きスロット(True)の連続区間を "HH:MM-HH:MM" のリストにする。"""
    ranges = []
    start = None
    for i, free in enumerate(slots + [False]):
        if free and start is None:
            start = i
        elif not free and start is not None:
            ranges.append((start * SLOT_MINUTES, i * SLOT_MINUTES))
            start = None
    return [f"{s // 60:02d}:{s % 60:02d}-{e // 60:02d}:{e % 60:02d}" for s, e in ranges]


def map_facility(raw_name):
    """施設名を (building_id, floor, room_id, name) へ変換する。対象外は None。"""
    normalized = unicodedata.normalize("NFKC", raw_name).replace("−", "-")
    m = FACILITY_RE.match(normalized)
    if not m:
        return None
    building_num, room = m.groups()
    return (f"b{building_num}", f"{room[0]}F", f"b{building_num}-{room}", room)


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    repo_root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else repo_root / "apps/server/data/classrooms.csv"

    parser = MatrixParser()
    parser.feed(src.read_text(encoding="utf-8"))

    if len(parser.dates) != 1:
        print(f"エラー: 対象日を特定できません(検出: {sorted(parser.dates)})", file=sys.stderr)
        sys.exit(1)
    raw_date = parser.dates.pop()
    date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"

    records = []
    for row in parser.rows:
        mapped = map_facility(row["name"])
        if mapped is None:
            print(f"警告: 機械判定できない施設名を除外: {row['name']}", file=sys.stderr)
            continue
        n = len(row["slots"])
        if n != SLOTS_PER_DAY:
            print(
                f"警告: {row['name']} のスロット数が {n} (期待 {SLOTS_PER_DAY})",
                file=sys.stderr,
            )
        building_id, floor, room_id, name = mapped
        records.append(
            {
                "building_id": building_id,
                "floor": floor,
                "room_id": room_id,
                "name": name,
                "capacity": row["capacity"],
                "date": date,
                "available": "/".join(slots_to_ranges(row["slots"])),
            }
        )

    records.sort(key=lambda r: (r["building_id"], r["room_id"]))
    with dst.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["building_id", "floor", "room_id", "name", "capacity", "date", "available"]
        )
        writer.writeheader()
        writer.writerows(records)

    print(f"{len(records)} 教室({date})を {dst} に出力しました")


if __name__ == "__main__":
    main()
