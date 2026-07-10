// GeoJSON(OSM/Overpass)を実行時に投影して実地理マップを生成する共通ロジック(issue #3)。
// キャンパス・駅の各エリアで共有する:建物エッジの主方向で回転(街区の傾きを打ち消す)→
// フィット→SVG パス + 投影アフィン + エリア判定用 bbox を組み立てる。
// 建物/土地(Polygon・MultiPolygon)は面、道(LineString=footway 等)は線として描く。
// GPS 投影(coords.project)も同じアフィン(projection)を使う。

import type { AreaProjection } from "@/types/campus";

export type AreaShapeKind = "building" | "land" | "road" | "other";
export interface AreaShape {
  d: string;
  kind: AreaShapeKind;
  name: string;
  /** buildingWays で対応付けた建物 id(号館など)。なければ空。 */
  ref: string;
}
/** アフィン係数は types/campus の AreaProjection に一本化(挙動不変・issue #98)。 */
export type AreaGeoProjection = AreaProjection;
export interface AreaGeoBounds {
  lat0: number;
  lng0: number;
  lat1: number;
  lng1: number;
}
export interface AreaGeo {
  shapes: AreaShape[];
  buildings: Record<string, { x: number; y: number; w: number; h: number }>;
  projection: AreaGeoProjection;
  size: { width: number; height: number };
  bounds: AreaGeoBounds;
}

export interface GeoFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}
/** import した GeoJSON の features を buildAreaGeo に渡すためのヘルパ。 */
export const featuresOf = (raw: unknown): GeoFeature[] =>
  (raw as { features: GeoFeature[] }).features;

export interface BuildAreaGeoOpts {
  /** OSM way id → 建物 id。指定した建物を基準にフィットし、オーバーレイ用の矩形も返す。 */
  buildingWays?: Record<string, string>;
  /** フィット窓の外側余白(小さいほど大きく表示)。 */
  pad?: number;
  width?: number;
  height?: number;
  margin?: number;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

const polygonsOf = (g: GeoFeature["geometry"]): number[][][][] => {
  if (g.type === "Polygon") return [g.coordinates as number[][][]];
  if (g.type === "MultiPolygon") return g.coordinates as number[][][][];
  return [];
};
const lineOf = (g: GeoFeature["geometry"]): number[][] | null =>
  g.type === "LineString" ? (g.coordinates as number[][]) : null;

const polyVertices = (fs: GeoFeature[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const f of fs)
    for (const poly of polygonsOf(f.geometry))
      for (const ring of poly) for (const c of ring) out.push([c[0], c[1]]);
  return out;
};

export function buildAreaGeo(rawFeatures: GeoFeature[], opts: BuildAreaGeoOpts = {}): AreaGeo {
  const W = opts.width ?? 800;
  const H = opts.height ?? 640;
  const MARGIN = opts.margin ?? 20;
  const PAD = opts.pad ?? 0.15;
  const buildingWays = opts.buildingWays ?? {};

  const refOf = (f: GeoFeature): string =>
    buildingWays[String(f.properties["@id"] ?? "").replace("way/", "")] ?? "";
  const kindOf = (f: GeoFeature): AreaShapeKind => {
    const p = f.properties;
    if (p.building) return "building";
    if (p.landuse || p.leisure || p.amenity) return "land";
    return "other";
  };

  // 投影の基準は面ジオメトリ(建物/土地)のみ(道の線は含めない)。
  const polyFeats = rawFeatures.filter((f) => polygonsOf(f.geometry).length > 0);
  const allPts = polyVertices(polyFeats);
  const lon0 = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
  const lat0 = allPts.reduce((s, p) => s + p[1], 0) / allPts.length;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);

  // 建物エッジの主方向(mod 90°・長さ重み)→ 回転角(街区の傾きを打ち消す)。
  const hist: Record<number, number> = {};
  for (const f of polyFeats) {
    if (!f.properties.building) continue;
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const dx = (ring[i + 1][0] - ring[i][0]) * mLon;
          const dy = (ring[i + 1][1] - ring[i][1]) * mLat;
          const len = Math.hypot(dx, dy);
          if (len < 1) continue;
          const a = Math.round(((((Math.atan2(dy, dx) * 180) / Math.PI) % 90) + 90) % 90);
          hist[a] = (hist[a] ?? 0) + len;
        }
      }
    }
  }
  let peak = 0;
  for (const a in hist) if ((hist[Number(a)] ?? 0) > (hist[peak] ?? 0)) peak = Number(a);
  const th = ((peak <= 45 ? peak : peak - 90) * Math.PI) / 180;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const rot = (lon: number, lat: number): [number, number] => {
    const e = (lon - lon0) * mLon;
    const n = (lat - lat0) * mLat;
    return [e * cs + n * sn, -e * sn + n * cs];
  };

  // フィット窓は対応建物(あれば)基準。無ければ全ポリゴン。
  const focusFs = polyFeats.filter((f) => refOf(f) !== "");
  const fitPts = polyVertices(focusFs.length ? focusFs : polyFeats);
  const frx = fitPts.map((p) => rot(p[0], p[1])[0]);
  const fry = fitPts.map((p) => rot(p[0], p[1])[1]);
  const rxMin = Math.min(...frx);
  const ryMin = Math.min(...fry);
  const winW = (Math.max(...frx) - rxMin) * (1 + 2 * PAD);
  const winH = (Math.max(...fry) - ryMin) * (1 + 2 * PAD);
  const winXMin = rxMin - (Math.max(...frx) - rxMin) * PAD;
  const winYMin = ryMin - (Math.max(...fry) - ryMin) * PAD;
  const sc = Math.min((W - 2 * MARGIN) / winW, (H - 2 * MARGIN) / winH);
  const ox = (W - winW * sc) / 2;
  const oy = (H - winH * sc) / 2;

  // (lon,lat) -> (x,y) の1アフィン。
  const ax = mLon * cs * sc;
  const bx = mLat * sn * sc;
  const cx = ox - winXMin * sc;
  const ay = mLon * sn * sc;
  const by = -mLat * cs * sc;
  const cy = (winYMin + winH) * sc + oy;

  const px = (c: number[]): [number, number] => [
    r1(ax * (c[0] - lon0) + bx * (c[1] - lat0) + cx),
    r1(ay * (c[0] - lon0) + by * (c[1] - lat0) + cy),
  ];
  const pathOf = (ring: number[][], close: boolean): string => {
    const pr = ring.map(px);
    return (
      `M${pr[0][0]} ${pr[0][1]}` +
      pr
        .slice(1)
        .map(([x, y]) => `L${x} ${y}`)
        .join("") +
      (close ? "Z" : "")
    );
  };

  const shapes: AreaShape[] = [];
  const buildings: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const f of rawFeatures) {
    const line = lineOf(f.geometry);
    if (line) {
      if (line.length >= 2)
        shapes.push({ d: pathOf(line, false), kind: "road", name: "", ref: "" });
      continue;
    }
    const polys = polygonsOf(f.geometry);
    if (!polys.length) continue;
    const ref = refOf(f);
    const proj: [number, number][] = [];
    let d = "";
    for (const poly of polys)
      for (const ring of poly) {
        d += pathOf(ring, true);
        for (const c of ring) proj.push(px(c));
      }
    shapes.push({ d, kind: kindOf(f), name: String(f.properties.name ?? ""), ref });
    if (ref) {
      const xs = proj.map((p) => p[0]);
      const ys = proj.map((p) => p[1]);
      const mnx = Math.min(...xs);
      const mny = Math.min(...ys);
      buildings[ref] = {
        x: r1(mnx),
        y: r1(mny),
        w: r1(Math.max(...xs) - mnx),
        h: r1(Math.max(...ys) - mny),
      };
    }
  }

  // エリア判定用 bbox(フィット対象の緯度経度 + 余白)。
  const clat = fitPts.map((p) => p[1]);
  const clon = fitPts.map((p) => p[0]);
  const bpadLa = (Math.max(...clat) - Math.min(...clat)) * PAD;
  const bpadLo = (Math.max(...clon) - Math.min(...clon)) * PAD;

  return {
    shapes,
    buildings,
    projection: { lon0, lat0, ax, bx, cx, ay, by, cy },
    size: { width: W, height: H },
    bounds: {
      lat0: Math.max(...clat) + bpadLa,
      lng0: Math.min(...clon) - bpadLo,
      lat1: Math.min(...clat) - bpadLa,
      lng1: Math.max(...clon) + bpadLo,
    },
  };
}
