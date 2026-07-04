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

# OSM way ID → 号館(ユーザー提供の対応)。この建物は実地図上の号館オーバーレイに使う。
BUILDING_WAYS = {
    "387067017": "b1",
    "387067018": "b2",
    "387067016": "b3",
    "184604665": "b4",
    "1075948950": "b5",
    "1031355647": "b6",
}


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

    # フィット窓は号館(b1〜b6)を基準にする(キャンパスを主役に、周辺は文脈として外側へ)。
    campus_pts = [
        c
        for f in feats
        if f["properties"].get("@id", "").replace("way/", "") in BUILDING_WAYS
        for r in rings(f["geometry"])
        for c in r
    ]
    fit_src = campus_pts or pts
    frx = [rot(lo, la)[0] for lo, la in fit_src]
    fry = [rot(lo, la)[1] for lo, la in fit_src]
    ex, ey = max(frx) - min(frx), max(fry) - min(fry)
    PAD = 0.5  # 号館の外側に extent×PAD ぶん余白(周辺を見せる)
    rx_min, rx_max = min(frx) - ex * PAD, max(frx) + ex * PAD
    ry_min, ry_max = min(fry) - ey * PAD, max(fry) + ey * PAD
    sc = min((W - 2 * MARGIN) / (rx_max - rx_min), (H - 2 * MARGIN) / (ry_max - ry_min))
    ox = (W - (rx_max - rx_min) * sc) / 2
    oy = (H - (ry_max - ry_min) * sc) / 2

    # エリア判定用 bbox は号館のある一帯(号館の緯度経度 bbox + 余白)。
    clat = [la for _, la in fit_src]
    clon = [lo for lo, _ in fit_src]
    bpad_la = (max(clat) - min(clat)) * PAD
    bpad_lo = (max(clon) - min(clon)) * PAD

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
    rects: dict[str, dict] = {}  # 号館 → 投影後の矩形 {x,y,w,h}
    for f in feats:
        geom = f["geometry"]
        if geom["type"] != "Polygon":
            continue
        ref = BUILDING_WAYS.get(f["properties"].get("@id", "").replace("way/", ""), "")
        d = ""
        proj = []
        for r in geom["coordinates"]:
            pr = [px(lo, la) for lo, la in r]
            proj += pr
            d += f"M{pr[0][0]} {pr[0][1]}" + "".join(f"L{x} {y}" for x, y in pr[1:]) + "Z"
        shapes.append(
            {"d": d, "kind": classify(f["properties"]), "name": f["properties"].get("name", ""), "ref": ref}
        )
        if ref:
            xs = [p[0] for p in proj]
            ys = [p[1] for p in proj]
            rects[ref] = {
                "x": round(min(xs), 1),
                "y": round(min(ys), 1),
                "w": round(max(xs) - min(xs), 1),
                "h": round(max(ys) - min(ys), 1),
            }

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
        "  /** 号館(b1〜b6)なら building id、そうでなければ空。 */",
        "  ref: string;",
        "}",
        "",
        "/** 号館(b1〜b6)の実地図上の矩形(投影後 x/y/w/h)。建物オーバーレイの配置に使う。 */",
        "export const CAMPUS_BUILDINGS: Record<string, { x: number; y: number; w: number; h: number }> = {",
        *[
            f'  {ref}: {{ x: {r["x"]}, y: {r["y"]}, w: {r["w"]}, h: {r["h"]} }},'
            for ref, r in sorted(rects.items())
        ],
        "};",
        "",
        "/** 緯度経度 → 描画座標(x,y)のアフィン係数(回転込み)。GPS 投影 coords.project が使う。 */",
        "export const CAMPUS_PROJECTION = {",
        f"  lon0: {num(lon0)}, lat0: {num(lat0)},",
        f"  ax: {num(ax)}, bx: {num(bx)}, cx: {num(cx)},",
        f"  ay: {num(ay)}, by: {num(by)}, cy: {num(cy)},",
        "} as const;",
        "",
        "/** エリア判定用の実測 bbox(号館一帯・北西=lat0/lng0, 南東=lat1/lng1)。 */",
        "export const CAMPUS_GEO_BOUNDS = {",
        f"  lat0: {num(max(clat) + bpad_la)}, lng0: {num(min(clon) - bpad_lo)},",
        f"  lat1: {num(min(clat) - bpad_la)}, lng1: {num(max(clon) + bpad_lo)},",
        "} as const;",
        "",
        f"export const CAMPUS_GEO_SIZE = {{ width: {W}, height: {H} }} as const;",
        "",
        "export const CAMPUS_GEO: CampusShape[] = [",
    ]
    for s in shapes:
        name = s["name"].replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'  {{ kind: "{s["kind"]}", ref: "{s["ref"]}", name: "{name}", d: "{s["d"]}" }},')
    lines.append("];")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"生成: {OUT.relative_to(ROOT)}  shapes={len(shapes)}  回転θ={theta_deg}度  scale={sc:.3f}")


if __name__ == "__main__":
    main()
