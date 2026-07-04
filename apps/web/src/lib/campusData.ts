import type { AreaId, Building, Floor, Room } from "@/types/campus";

// 教室配置図(有明キャンパス)PDFより。教室中心・主要フロアのみ収録。
// docs/05 §2・§5 の buildings.json に相当するフロント側インライン定数(本番は GET /api/campus)。

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
    cap: "図書館・CLS",
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

export const MAP_TEXTS: Record<AreaId, MapText[]> = {
  campus: [
    { x: 258, y: 552, t: "正門", size: 12, w: 600, c: "#4d4d4d", a: "c" },
    { x: 440, y: 388, t: "モニュメント門", size: 10, c: "#4d4d4d", a: "c" },
    { x: 14, y: 16, t: "← 至 りんかい線 東京テレポート", size: 10, c: "#888888", a: "l" },
    { x: 786, y: 16, t: "至 りんかい線 国際展示場 →", size: 10, c: "#888888", a: "r" },
    { x: 262, y: 628, t: "↓ 至 ゆりかもめ 東京ビッグサイト", size: 10, c: "#888888", a: "l" },
    { x: 778, y: 624, t: "N ↑", size: 11, c: "#888888", a: "r", mono: true },
  ],
  station_1: [
    { x: 18, y: 116, t: "りんかい線", size: 10, c: "#888888", a: "l", mono: true },
    { x: 300, y: 232, t: "国際展示場駅", size: 16, w: 600, c: "#171717", a: "c" },
    { x: 300, y: 254, t: "RINKAI LINE", size: 9, c: "#888888", a: "c", mono: true },
    { x: 153, y: 341, t: "出口A", size: 10, c: "#4d4d4d", a: "c" },
    { x: 443, y: 341, t: "出口B", size: 10, c: "#4d4d4d", a: "c" },
    { x: 24, y: 426, t: "↓ 東京ビッグサイト", size: 10, c: "#888888", a: "l" },
    { x: 576, y: 426, t: "有明キャンパスまで 徒歩約8分 →", size: 10, c: "#888888", a: "r" },
  ],
  station_2: [
    { x: 18, y: 76, t: "りんかい線", size: 10, c: "#888888", a: "l", mono: true },
    { x: 300, y: 190, t: "東京テレポート駅", size: 16, w: 600, c: "#171717", a: "c" },
    { x: 300, y: 212, t: "RINKAI LINE", size: 9, c: "#888888", a: "c", mono: true },
    { x: 255, y: 333, t: "バスターミナル", size: 11, c: "#4d4d4d", a: "c" },
    { x: 460, y: 340, t: "ロータリー", size: 10, c: "#888888", a: "c" },
    { x: 24, y: 436, t: "↓ ダイバーシティ東京 方面", size: 10, c: "#888888", a: "l" },
    { x: 576, y: 436, t: "有明キャンパスまで 徒歩約15分 →", size: 10, c: "#888888", a: "r" },
  ],
};

// 圏外/別エリアのメンバーを地図端に寄せる位置(プロトタイプの CLAMP)。
export const CLAMP: Record<AreaId, Record<string, [number, number]>> = {
  campus: { station_1: [730, 150], station_2: [72, 150], lost: [370, 600] },
  station_1: { campus: [528, 300], station_2: [72, 260], lost: [300, 456] },
  station_2: { campus: [528, 240], station_1: [528, 100], lost: [300, 456] },
};
