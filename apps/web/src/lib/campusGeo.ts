// data/campus.geojson.json(OSM/Overpass の GeoJSON)を実行時に投影して実地理マップを生成する(issue #3)。
// build 時の baked SVG をやめ、GeoJSON を読み込み→回転・フィット→SVG パスをここで動的に組み立てる。
// 建物/土地(Polygon・MultiPolygon)は面、道(LineString=footway 等)は線として描画する。
// GPS 投影(coords.project)も同じアフィン CAMPUS_PROJECTION を使う。号館(b1〜b6)を大きく中心に配置する。

import rawGeojson from "@/data/campus.geojson.json";

export type CampusShapeKind = "building" | "land" | "road" | "other";
export interface CampusShape {
  d: string;
  kind: CampusShapeKind;
  name: string;
  /** 号館(b1〜b6)なら building id、そうでなければ空。 */
  ref: string;
}

interface GeoFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

const W = 800;
const H = 640;
const MARGIN = 20;
const PAD = 0.15; // 号館の外側の余白(小さいほど号館が大きく表示される)

// OSM way ID → 号館(ユーザー提供の対応)。
const BUILDING_WAYS: Record<string, string> = {
  "387067017": "b1",
  "387067018": "b2",
  "387067016": "b3",
  "184604665": "b4",
  "1075948950": "b5",
  "1031355647": "b6",
};

const features = (rawGeojson as unknown as { features: GeoFeature[] }).features;

// 面ジオメトリ(Polygon/MultiPolygon)を「ポリゴン(=リング配列)の配列」に正規化。
const polygonsOf = (g: GeoFeature["geometry"]): number[][][][] => {
  if (g.type === "Polygon") return [g.coordinates as number[][][]];
  if (g.type === "MultiPolygon") return g.coordinates as number[][][][];
  return [];
};
const lineOf = (g: GeoFeature["geometry"]): number[][] | null =>
  g.type === "LineString" ? (g.coordinates as number[][]) : null;

const refOf = (f: GeoFeature): string =>
  BUILDING_WAYS[String(f.properties["@id"] ?? "").replace("way/", "")] ?? "";
const kindOf = (f: GeoFeature): CampusShapeKind => {
  const p = f.properties;
  if (p.building) return "building";
  if (p.landuse || p.leisure || p.amenity) return "land";
  return "other";
};
const polyVertices = (fs: GeoFeature[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const f of fs)
    for (const poly of polygonsOf(f.geometry))
      for (const ring of poly) for (const c of ring) out.push([c[0], c[1]]);
  return out;
};

// 投影の基準は面ジオメトリ(建物/土地)のみで決める(道の線は基準に含めない)。
const polyFeats = features.filter((f) => polygonsOf(f.geometry).length > 0);
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

// フィット窓は号館(b1〜b6)基準にして、キャンパスを大きく中心に置く。
const campusFs = polyFeats.filter((f) => refOf(f) !== "");
const fitPts = polyVertices(campusFs.length ? campusFs : polyFeats);
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

// (lon,lat) -> (x,y) の1アフィン: x=ax*(lon-lon0)+bx*(lat-lat0)+cx, y=ay*..+by*..+cy
const ax = mLon * cs * sc;
const bx = mLat * sn * sc;
const cx = ox - winXMin * sc;
const ay = mLon * sn * sc;
const by = -mLat * cs * sc;
const cy = (winYMin + winH) * sc + oy;

const r1 = (v: number): number => Math.round(v * 10) / 10;
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

const shapes: CampusShape[] = [];
const buildings: Record<string, { x: number; y: number; w: number; h: number }> = {};
for (const f of features) {
  const line = lineOf(f.geometry);
  if (line) {
    if (line.length >= 2) shapes.push({ d: pathOf(line, false), kind: "road", name: "", ref: "" });
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

// エリア判定用 bbox(号館一帯の緯度経度 + 余白)。
const clat = fitPts.map((p) => p[1]);
const clon = fitPts.map((p) => p[0]);
const bpadLa = (Math.max(...clat) - Math.min(...clat)) * PAD;
const bpadLo = (Math.max(...clon) - Math.min(...clon)) * PAD;

export const CAMPUS_GEO: CampusShape[] = shapes;
export const CAMPUS_BUILDINGS: Record<string, { x: number; y: number; w: number; h: number }> =
  buildings;
export const CAMPUS_PROJECTION = { lon0, lat0, ax, bx, cx, ay, by, cy };
export const CAMPUS_GEO_SIZE = { width: W, height: H };
export const CAMPUS_GEO_BOUNDS = {
  lat0: Math.max(...clat) + bpadLa,
  lng0: Math.min(...clon) - bpadLo,
  lat1: Math.min(...clat) - bpadLa,
  lng1: Math.max(...clon) + bpadLo,
};
