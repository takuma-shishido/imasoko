#!/usr/bin/env python3
"""data/キャンパス.json(OSM/Overpass の GeoJSON)→ フロント用の実地理SVGデータを生成する。

実 bbox を campus の描画空間(800x640)へ線形投影し、各ポリゴンを SVG パスにする。
生成物 apps/web/src/lib/campusGeo.ts は手編集しない(このスクリプトを再実行する)。

  使い方:  python3 scripts/build_campus_geo.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "キャンパス.json"
OUT = ROOT / "apps" / "web" / "src" / "lib" / "campusGeo.ts"

W, H = 800, 640  # campus の描画空間(mapAreas.ts の AREAS.campus と一致)


def all_coords(geom):
    def walk(c):
        if c and isinstance(c[0], (int, float)):
            yield c
        else:
            for e in c:
                yield from walk(e)

    yield from walk(geom["coordinates"])


def classify(props: dict) -> str:
    if props.get("building"):
        return "building"
    if props.get("landuse") or props.get("leisure") or props.get("amenity"):
        return "land"
    return "other"


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    feats = data["features"]

    lons = [c[0] for f in feats for c in all_coords(f["geometry"])]
    lats = [c[1] for f in feats for c in all_coords(f["geometry"])]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    def px(lon: float, lat: float) -> tuple[float, float]:
        x = (lon - min_lon) / (max_lon - min_lon) * W
        y = (max_lat - lat) / (max_lat - min_lat) * H
        return round(x, 1), round(y, 1)

    def ring_path(ring: list) -> str:
        pts = [px(lon, lat) for lon, lat in ring]
        head = f"M{pts[0][0]} {pts[0][1]}"
        body = "".join(f"L{x} {y}" for x, y in pts[1:])
        return head + body + "Z"

    shapes = []
    for f in feats:
        geom = f["geometry"]
        if geom["type"] != "Polygon":
            continue
        d = "".join(ring_path(ring) for ring in geom["coordinates"])
        props = f["properties"]
        shapes.append(
            {"d": d, "kind": classify(props), "name": props.get("name", "")}
        )

    lines = [
        "// 自動生成: scripts/build_campus_geo.py が data/キャンパス.json(OSM)から生成。手編集しない。",
        "// 実 bbox を campus 描画空間(800x640)へ線形投影した実地理フットプリント(issue #3)。",
        'export type CampusShapeKind = "building" | "land" | "other";',
        "export interface CampusShape {",
        "  d: string;",
        "  kind: CampusShapeKind;",
        "  name: string;",
        "}",
        "",
        "/** 実測キャリブレーション(北西=lat0/lng0, 南東=lat1/lng1)。GPS 投影に使う。 */",
        "export const CAMPUS_GEO_BOUNDS = {",
        f"  lat0: {max_lat}, lng0: {min_lon}, lat1: {min_lat}, lng1: {max_lon},",
        "} as const;",
        "",
        f"export const CAMPUS_GEO_SIZE = {{ width: {W}, height: {H} }} as const;",
        "",
        "export const CAMPUS_GEO: CampusShape[] = [",
    ]
    for s in shapes:
        name = s["name"].replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'  {{ kind: "{s["kind"]}", name: "{name}", d: "{s["d"]}" }},')
    lines.append("];")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    b = ((min_lat + max_lat) / 2, (min_lon + max_lon) / 2)
    print(f"生成: {OUT.relative_to(ROOT)}  shapes={len(shapes)}  bbox中心={b[0]:.6f},{b[1]:.6f}")
    print(f"bounds lat0={max_lat} lng0={min_lon} lat1={min_lat} lng1={max_lon}")


if __name__ == "__main__":
    main()
