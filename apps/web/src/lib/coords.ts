import type { AreaId, MapArea } from "@/types/campus";
import { MAP_AREAS } from "./mapAreas";

// 緯度経度 → 自作マップ座標(dev-docs §7 / docs/05 §1)。
// キャンパス程度の狭い範囲では線形変換で十分。エリアごとに bounds(北西/南東の実測2点)を持つ。
//
// 本アプリのデモはワールド x/y を直接使う(プロトタイプ忠実)ため、この変換は
// 実位置取得経路(useGeolocation → position)を有効化する際に使用する。ユニットテスト付き(docs/02 §6)。

export interface Projected {
  x: number; // 画像左上原点の px 座標(x = u * width)
  y: number; // y = v * height(上→下)
  u: number; // 0..1 左→右
  v: number; // 0..1 上→下
}

/** 緯度経度を、そのエリアの画像 px 座標(左上原点)へ投影する。 */
export function project(area: MapArea, lat: number, lng: number): Projected {
  if (area.matrix) {
    // 回転込みアフィン(campus・issue #3)。campusGeo.ts の生成器と同じ係数。
    const m = area.matrix;
    const x = m.ax * (lng - m.lon0) + m.bx * (lat - m.lat0) + m.cx;
    const y = m.ay * (lng - m.lon0) + m.by * (lat - m.lat0) + m.cy;
    return { x, y, u: x / area.width, v: y / area.height };
  }
  const { lat0, lng0, lat1, lng1 } = area.bounds;
  const u = (lng - lng0) / (lng1 - lng0);
  const v = (lat0 - lat) / (lat0 - lat1);
  return { u, v, x: u * area.width, y: v * area.height };
}

/** project の逆変換:エリア画像 px 座標(左上原点)→ 緯度経度。meeting_point(coords)送信で使う。 */
export function unproject(area: MapArea, x: number, y: number): { lat: number; lng: number } {
  if (area.matrix) {
    const m = area.matrix;
    const det = m.ax * m.by - m.bx * m.ay;
    const dx = x - m.cx;
    const dy = y - m.cy;
    return {
      lng: m.lon0 + (m.by * dx - m.bx * dy) / det,
      lat: m.lat0 + (-m.ay * dx + m.ax * dy) / det,
    };
  }
  const { lat0, lng0, lat1, lng1 } = area.bounds;
  const u = x / area.width;
  const v = y / area.height;
  return { lng: lng0 + u * (lng1 - lng0), lat: lat0 - v * (lat0 - lat1) };
}

/** 2点間のおおよその距離(m)。位置送信スロットリング(5m 判定)に使う。 */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000; // 地球半径(m)
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const meanLat = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const x = dLng * Math.cos(meanLat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

/** 基点(rx,ry)から点(px,py)へ向かう方向で、矩形 [xmin,xmax]×[ymin,ymax] の端へ寄せる。
 *  範囲外メンバーを「その人がいる実方向」で表示領域の端に出すのに使う(issue #3)。 */
export function clampToEdge(
  rx: number,
  ry: number,
  px: number,
  py: number,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number
): { x: number; y: number } {
  const dx = px - rx;
  const dy = py - ry;
  if (dx === 0 && dy === 0) return { x: rx, y: ry };
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (xmax - rx) / dx);
  else if (dx < 0) t = Math.min(t, (xmin - rx) / dx);
  if (dy > 0) t = Math.min(t, (ymax - ry) / dy);
  else if (dy < 0) t = Math.min(t, (ymin - ry) / dy);
  if (!isFinite(t) || t < 0) t = 0;
  return { x: rx + dx * t, y: ry + dy * t };
}

export interface ClampedProjected {
  x: number;
  y: number;
  out: boolean; // 選択エリアの範囲外(圏外)
}

/** 範囲外は u,v を 0..1 にクランプして端に寄せ、圏外フラグを返す(dev-docs §7 の決定)。 */
export function projectClamped(area: MapArea, lat: number, lng: number): ClampedProjected {
  const { u, v } = project(area, lat, lng);
  const out = u < 0 || u > 1 || v < 0 || v > 1;
  const cu = Math.min(Math.max(u, 0), 1);
  const cv = Math.min(Math.max(v, 0), 1);
  return { x: cu * area.width, y: cv * area.height, out };
}

// エリア判定は実測 bbox(緯度経度)で直接行う(回転投影と切り離す)。
const inBounds = (area: MapArea, lat: number, lng: number): boolean => {
  const { lat0, lng0, lat1, lng1 } = area.bounds;
  const laMin = Math.min(lat0, lat1);
  const laMax = Math.max(lat0, lat1);
  const loMin = Math.min(lng0, lng1);
  const loMax = Math.max(lng0, lng1);
  return lat >= laMin && lat <= laMax && lng >= loMin && lng <= loMax;
};

/**
 * どのエリアの bounds に入るか判定する(docs/05 §1)。
 * 複数該当なら中心が近い方、どれにも入らなければ null(全エリア圏外)。
 */
export function resolveArea(
  lat: number,
  lng: number,
  areas: Record<AreaId, MapArea> = MAP_AREAS
): AreaId | null {
  const hits = (Object.keys(areas) as AreaId[]).filter((id) => inBounds(areas[id], lat, lng));
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  // 中心に近いエリアを選ぶ
  let best: AreaId = hits[0];
  let bestD = Infinity;
  for (const id of hits) {
    const b = areas[id].bounds;
    const cLat = (b.lat0 + b.lat1) / 2;
    const cLng = (b.lng0 + b.lng1) / 2;
    const d = Math.hypot(lat - cLat, lng - cLng);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
