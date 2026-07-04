#!/usr/bin/env python3
"""data/キャンパス.json(OSM/Overpass の GeoJSON)→ フロント用の実地理SVGデータを生成する。

OSM は真北基準だが有明の街区は北から傾いているため、建物エッジの主方向で回転させ、
画面軸に整列(斜め表示を解消)した上で campus 描画空間(800x640)へフィットする。
GPS 投影(coords.project)も同じアフィン変換を使えるよう、係数 CAMPUS_PROJECTION を出力する。

生成物 apps/web/src/lib/campusGeo.ts は手編集しない(このスクリプトを再実行する)。
  使い方:  python3 scripts/build_campus_geo.py
"""

import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "キャンパス.json"
OUT = ROOT / "apps" / "web" / "src" / "lib" / "campusGeo.ts"

W, H = 800, 640
MARGIN = 20


def rings(geom):
    def walk(c):
        if c and isinstance(c[0][0], (int, float)):
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
    pts = [c for f in feats for r in rings(f["geometry"]) for c in r]

    lon0 = sum(p[0] for p in pts) / len(pts)
    lat0 = sum(p[1] for p in pts) / len(pts)
    m_lat = 111320.0
    m_lon = 111320.0 * math.cos(math.radians(lat0))

    # 建物エッジの主方向(mod 90°・長さ重み)→ 回転角
    hist = defaultdict(float)
    for f in feats:
        if not f["properties"].get("building"):
            continue
        for r in rings(f["geometry"]):
            for (lo1, la1), (lo2, la2) in zip(r, r[1:]):
                dx, dy = (lo2 - lo1) * m_lon, (la2 - la1) * m_lat
                length = math.hypot(dx, dy)
                if length >= 1:
                    hist[round(math.degrees(math.atan2(dy, dx)) % 90)] += length
    peak = max(hist, key=hist.get)
    theta_deg = peak if peak <= 45 else peak - 90
    th = math.radians(theta_deg)
    cs, sn = math.cos(th), math.sin(th)

    def rot(lon, lat):
        e, n = (lon - lon0) * m_lon, (lat - lat0) * m_lat
        return e * cs + n * sn, -e * sn + n * cs  # rotate by -theta

    rxs = [rot(lo, la)[0] for lo, la in pts]
    rys = [rot(lo, la)[1] for lo, la in pts]
    rx_min, rx_max = min(rxs), max(rxs)
    ry_min, ry_max = min(rys), max(rys)
    sc = min((W - 2 * MARGIN) / (rx_max - rx_min), (H - 2 * MARGIN) / (ry_max - ry_min))
    ox = (W - (rx_max - rx_min) * sc) / 2
    oy = (H - (ry_max - ry_min) * sc) / 2

    # (lon,lat) -> (x,y) を1つのアフィンに畳む: x=ax*dlon+bx*dlat+cx, y=ay*dlon+by*dlat+cy
    ax = m_lon * cs * sc
    bx = m_lat * sn * sc
    cx = ox - rx_min * sc
    ay = m_lon * sn * sc
    by = -m_lat * cs * sc
    cy = ry_max * sc + oy

    def px(lon, lat):
        return round(ax * (lon - lon0) + bx * (lat - lat0) + cx, 1), round(
            ay * (lon - lon0) + by * (lat - lat0) + cy, 1
        )

    shapes = []
    for f in feats:
        geom = f["geometry"]
        if geom["type"] != "Polygon":
            continue
        d = ""
        for r in geom["coordinates"]:
            p0 = px(*r[0])
            d += f"M{p0[0]} {p0[1]}" + "".join(f"L{px(lo, la)[0]} {px(lo, la)[1]}" for lo, la in r[1:]) + "Z"
        shapes.append({"d": d, "kind": classify(f["properties"]), "name": f["properties"].get("name", "")})

    def num(v: float) -> str:
        return repr(round(v, 9))

    lines = [
        "// 自動生成: scripts/build_campus_geo.py が data/キャンパス.json(OSM)から生成。手編集しない。",
        "// 街区の傾き(建物主方向)で回転し 800x640 へフィットした実地理フットプリント(issue #3)。",
        'export type CampusShapeKind = "building" | "land" | "other";',
        "export interface CampusShape {",
        "  d: string;",
        "  kind: CampusShapeKind;",
        "  name: string;",
        "}",
        "",
        "/** 緯度経度 → 描画座標(x,y)のアフィン係数(回転込み)。GPS 投影 coords.project が使う。 */",
        "export const CAMPUS_PROJECTION = {",
        f"  lon0: {num(lon0)}, lat0: {num(lat0)},",
        f"  ax: {num(ax)}, bx: {num(bx)}, cx: {num(cx)},",
        f"  ay: {num(ay)}, by: {num(by)}, cy: {num(cy)},",
        "} as const;",
        "",
        "/** エリア判定用の実測 bbox(北西=lat0/lng0, 南東=lat1/lng1)。 */",
        "export const CAMPUS_GEO_BOUNDS = {",
        f"  lat0: {num(max(p[1] for p in pts))}, lng0: {num(min(p[0] for p in pts))},",
        f"  lat1: {num(min(p[1] for p in pts))}, lng1: {num(max(p[0] for p in pts))},",
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
    print(f"生成: {OUT.relative_to(ROOT)}  shapes={len(shapes)}  回転θ={theta_deg}度  scale={sc:.3f}")


if __name__ == "__main__":
    main()
