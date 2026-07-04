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
  const { lat0, lng0, lat1, lng1 } = area.bounds;
  const u = (lng - lng0) / (lng1 - lng0);
  const v = (lat0 - lat) / (lat0 - lat1);
  return { u, v, x: u * area.width, y: v * area.height };
}

/** project の逆変換:エリア画像 px 座標(左上原点)→ 緯度経度。meeting_point(coords)送信で使う。 */
export function unproject(area: MapArea, x: number, y: number): { lat: number; lng: number } {
  const { lat0, lng0, lat1, lng1 } = area.bounds;
  const u = x / area.width;
  const v = y / area.height;
  return { lng: lng0 + u * (lng1 - lng0), lat: lat0 - v * (lat0 - lat1) };
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

const inBounds = (area: MapArea, lat: number, lng: number): boolean => {
  const { u, v } = project(area, lat, lng);
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
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
