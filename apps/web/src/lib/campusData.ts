import type { AreaId, Building, Floor, Room } from "@/types/campus";
import type { CampusRes } from "@/types/messages";
import { CAMPUS_BUILDINGS } from "./campusGeo";
import { STATION1_PROJECTION } from "./station1Geo";
import { STATION2_PROJECTION } from "./station2Geo";

// 教室配置図(有明キャンパス)PDFより。教室中心・主要フロアのみ収録。
// docs/05 §2・§5 の buildings.json に相当するフロント側の**フォールバック**定数。
// 実配線では GET /api/campus のデータで差し替える(issue #14)。レイアウト(x/y/w/h)はフロントが保持。

type RoomSpec = string | [string, string];

const mkF = (bid: string, level: string, arr: RoomSpec[]): Floor => ({
  level,
  rooms: arr.map((r): Room => {
    const [n, t] = Array.isArray(r) ? r : [r, null];
    return { id: bid + "-" + n, n, t };
  }),
});

const seq = (from: number, to: number, skip: number[] = []): string[] => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) if (!skip.includes(i)) out.push(String(i));
  return out;
};

// 号館番号(名前の先頭数字。無ければ id の数字)で昇順ソートする(issue #34)。
const buildingNo = (b: Building): number => {
  const fromName = parseInt(b.name, 10);
  return Number.isNaN(fromName) ? parseInt(b.id.replace(/\D/g, ""), 10) || 0 : fromName;
};
const byBuildingNo = (a: Building, b: Building): number => buildingNo(a) - buildingNo(b);

export const BUILDINGS: Building[] = [
  {
    id: "b1",
    name: "1号館",
    fl: "13F",
    cap: "13F ・ 図書館デッキ",
    x: 120,
    y: 70,
    w: 260,
    h: 100,
    floors: [
      mkF("b1", "5F", seq(501, 509, [507])),
      mkF("b1", "4F", seq(401, 408)),
      mkF("b1", "3F", seq(301, 308)),
      mkF("b1", "2F", seq(201, 208)),
    ],
  },
  {
    id: "b3",
    name: "3号館",
    fl: "3F",
    cap: "フードコート・食堂",
    x: 90,
    y: 370,
    w: 140,
    h: 110,
    floors: [
      mkF("b3", "3F", [
        ["301", "大教室"],
        ["302", "大教室"],
      ]),
    ],
  },
  {
    id: "b5",
    name: "5号館",
    fl: "7F",
    cap: "7F",
    fs: 17,
    x: 552,
    y: 240,
    w: 76,
    h: 140,
    floors: [
      mkF("b5", "5F", [
        ["501", "アクティブラーニング"],
        ["502", "アクティブラーニング"],
        "503",
        "504",
        "505",
      ]),
      mkF("b5", "4F", seq(401, 405)),
      mkF("b5", "3F", seq(301, 304)),
      mkF("b5", "2F", ["201"]),
      mkF("b5", "1F", ["101"]),
    ],
  },
  {
    id: "b6",
    name: "6号館",
    fl: "5F",
    cap: "5F",
    x: 70,
    y: 210,
    w: 140,
    h: 120,
    floors: [
      mkF("b6", "3F", [
        ["301", "実習室"],
        ["302", "実習室"],
        ["303", "実習室"],
      ]),
      mkF("b6", "2F", [
        ["201", "シミュレーション室"],
        ["202", "実習室"],
        ["203", "実習室"],
      ]),
      mkF("b6", "1F", ["101", "102", "103"]),
    ],
  },
  {
    id: "b2",
    name: "2号館",
    fl: "5F",
    cap: "図書館",
    x: 300,
    y: 200,
    w: 130,
    h: 110,
    floors: [
      mkF("b2", "4F", [
        ["401", "マルチメディア教室"],
        "402",
        ["404", "ゼミ室"],
        ["405", "ゼミ室"],
        "406",
      ]),
    ],
  },
  {
    id: "b4",
    name: "4号館",
    fl: "5F",
    cap: "キャリアセンター",
    x: 640,
    y: 250,
    w: 130,
    h: 190,
    floors: [mkF("b4", "4F", ["403", "410", "411", "412"]), mkF("b4", "3F", seq(301, 306))],
  },
];

// 号館を 1→6 の昇順に整える(定義順は 1/3/5/6/2/4 のため。issue #34)。
// 以降の BUILDING_LAYOUTS・mergeCampus・buildingOpts はこの順を引き継ぐ。
BUILDINGS.sort(byBuildingNo);

// 建物レイアウト(マップ上の配置・キャプション・表示順)の安定スナップショット。
// 号館(b1〜b6)の x/y/w/h は実地図データ(campusGeo.ts の CAMPUS_BUILDINGS)由来で、
// 実フットプリントに整列する(issue #3)。未対応の建物は campusData の模式値をフォールバック。
type BuildingLayout = Pick<Building, "id" | "x" | "y" | "w" | "h" | "fl" | "cap" | "fs">;
const BUILDING_LAYOUTS: BuildingLayout[] = BUILDINGS.map((b) => {
  const geo = CAMPUS_BUILDINGS[b.id];
  return {
    id: b.id,
    x: geo?.x ?? b.x,
    y: geo?.y ?? b.y,
    w: geo?.w ?? b.w,
    h: geo?.h ?? b.h,
    fl: b.fl,
    cap: b.cap,
    fs: b.fs,
  };
});

/** GET /api/campus のレスポンス → 内部 Building[](データ=サーバー / レイアウト=フロント)。 */
export function mergeCampus(res: CampusRes): Building[] {
  const byId = new Map(res.buildings.map((b) => [b.id, b]));
  const out: Building[] = [];
  for (const { id, ...rect } of BUILDING_LAYOUTS) {
    const sb = byId.get(id);
    if (!sb) continue; // レイアウト未定義の建物は模式マップに置けないためスキップ
    out.push({
      id,
      name: sb.name, // 名前・階・教室はサーバー由来
      ...rect,
      floors: sb.floors.map((f) => ({
        level: f.level,
        rooms: f.rooms.map((r) => ({ id: r.id, n: r.name, t: r.type ?? null })),
      })),
    });
  }
  return out;
}

/** BUILDINGS の中身をサーバー由来へ差し替える(参照は不変。bById 等の module 関数はこの配列を参照)。 */
export function setBuildings(next: Building[]): void {
  BUILDINGS.length = 0;
  BUILDINGS.push(...next);
  BUILDINGS.sort(byBuildingNo); // サーバー由来でも 1→6 の昇順を保つ(issue #34)
}

export const bById = (id: string): Building | undefined => BUILDINGS.find((b) => b.id === id);
export const bAnchor = (b: Building) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const bSpot = (b: Building) => ({ x: b.x + b.w / 2, y: b.y + b.h + 18 });

export const roomLookup = (rid: string): { b: Building; f: Floor; r: Room } | null => {
  for (const b of BUILDINGS)
    for (const f of b.floors) for (const r of f.rooms) if (r.id === rid) return { b, f, r };
  return null;
};

export const roomFull = (rid: string): string => {
  const hit = roomLookup(rid);
  if (!hit) return rid;
  return hit.b.name + " " + hit.r.n + (hit.r.t ? "(" + hit.r.t + ")" : "");
};

// 地図上の注記テキスト(データ定義 → コンポーネント描画)。
export interface MapText {
  x: number;
  y: number;
  t: string;
  size: number;
  w?: number;
  c: string;
  a: "l" | "r" | "c";
  mono?: boolean;
}

// 駅マップの駅名ランドマーク注記(issue #51)。駅そのもののジオメトリは GeoJSON に無いため、
// 各エリアの投影中心(projection.cx/cy = 面ジオメトリ重心の投影)へ駅名を置く。座標は投影から
// 算出するので mapTransform(pan/zoom)に追従する。名前は AREAS と揃える(りんかい線の2駅)。
const stationText = (proj: { cx: number; cy: number }, name: string): MapText[] => [
  { x: proj.cx, y: proj.cy - 9, t: name, size: 15, w: 600, c: "#171717", a: "c" },
  { x: proj.cx, y: proj.cy + 9, t: "りんかい線", size: 9, c: "#888888", a: "c", mono: true },
];

// campus は模式注記が実地理マップ(campusGeo)でズレるため空のまま(issue #3)。
export const MAP_TEXTS: Record<AreaId, MapText[]> = {
  campus: [],
  station_1: stationText(STATION1_PROJECTION, "国際展示場駅"),
  station_2: stationText(STATION2_PROJECTION, "東京テレポート駅"),
};

// 圏外/別エリアのメンバーを地図端に寄せる位置(プロトタイプの CLAMP)。
export const CLAMP: Record<AreaId, Record<string, [number, number]>> = {
  campus: { station_1: [730, 150], station_2: [72, 150], lost: [370, 600] },
  station_1: { campus: [528, 300], station_2: [72, 260], lost: [300, 456] },
  station_2: { campus: [528, 240], station_1: [528, 100], lost: [300, 456] },
};
