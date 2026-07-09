#!/usr/bin/env python3
"""MUSCAT の施設予約状況ページ(classinfo.html)を CSV に変換する。

ページ内の予約マトリクス表は 1 施設 = 1 行で、
「施設/備品名」「収容人数」「故障情報」の後に 10 分刻み(24h × 6)のセルが並ぶ。
空きセルは class に reservedColorDefault、予約済みセルは
reservedColorLecture / reservedColorOther などを持つ。

使い方:
    python3 scripts/classinfo_to_csv.py [入力HTML] [出力CSV]
    (省略時: scripts/classinfo.html → scripts/classinfo.csv)
"""

import csv
import sys
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


class MatrixParser(HTMLParser):
    """予約マトリクス表から (施設名, 収容人数, スロット占有状況) を集める。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []  # [{name, capacity, slots: [bool]*N}] (True = 空き)
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
            occupied = bool(classes & OCCUPIED_CLASSES) or bool(
                attrs.get("data-reserveddatakey", "").strip()
            )
            self._current["slots"].append(not occupied)

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


def main():
    script_dir = Path(__file__).parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else script_dir / "classinfo.html"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else script_dir / "classinfo.csv"

    parser = MatrixParser()
    parser.feed(src.read_text(encoding="utf-8"))

    with dst.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["施設名", "収容人数", "空き時間"])
        for row in parser.rows:
            n = len(row["slots"])
            if n != SLOTS_PER_DAY:
                print(
                    f"警告: {row['name']} のスロット数が {n} (期待 {SLOTS_PER_DAY})",
                    file=sys.stderr,
                )
            writer.writerow(
                [row["name"], row["capacity"], " / ".join(slots_to_ranges(row["slots"]))]
            )

    print(f"{len(parser.rows)} 施設を {dst} に出力しました")


if __name__ == "__main__":
    main()
