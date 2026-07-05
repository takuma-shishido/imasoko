import type { AreaId, AreaDef, MapArea } from "@/types/campus";
import { CAMPUS_GEO_BOUNDS, CAMPUS_PROJECTION } from "./campusGeo";
import { STATION1_GEO_BOUNDS, STATION1_PROJECTION } from "./station1Geo";
import { STATION2_GEO_BOUNDS, STATION2_PROJECTION } from "./station2Geo";

// プロトタイプ実行時のエリア定義(実地理マップのワールドサイズ + 距離換算)。
// 3エリアとも OSM GeoJSON を 800x640 へ実行時投影(issue #3)。mpp は概算(距離表示は #28 で GPS 実測へ移行済み)。
export const AREAS: Record<AreaId, AreaDef> = {
  campus: { name: "有明キャンパス", short: "キャンパス", w: 800, h: 640, mpp: 0.85 },
  station_1: { name: "国際展示場駅", short: "国際展示場", w: 800, h: 640, mpp: 0.5 },
  station_2: { name: "東京テレポート駅", short: "テレポート", w: 800, h: 640, mpp: 0.5 },
};

// 上部エリア切替の並び順(docs/05 §1)。
export const AREA_ORDER: AreaId[] = ["station_2", "campus", "station_1"];

// docs/dev-docs §7:実測キャリブレーション2点(北西角/南東角)。
// campus は data/キャンパス.json(OSM)の実 bbox(campusGeo.ts で生成)。駅2つは実測待ちのプレースホルダ。
export const MAP_AREAS: Record<AreaId, MapArea> = {
  campus: {
    id: "campus",
    name: "有明キャンパス",
    svg: "/map/campus.svg",
    width: AREAS.campus.w,
    height: AREAS.campus.h,
    bounds: { ...CAMPUS_GEO_BOUNDS }, // 実地理データ由来(エリア判定用・issue #3)
    matrix: { ...CAMPUS_PROJECTION }, // 回転込みアフィン投影(GPS→x/y)
  },
  station_1: {
    id: "station_1",
    name: "国際展示場駅",
    svg: "/map/station-1.svg",
    width: AREAS.station_1.w,
    height: AREAS.station_1.h,
    bounds: { ...STATION1_GEO_BOUNDS }, // 実地理データ由来(issue #3)
    matrix: { ...STATION1_PROJECTION }, // 回転込みアフィン投影(GPS→x/y)
  },
  station_2: {
    id: "station_2",
    name: "東京テレポート駅",
    svg: "/map/station-2.svg",
    width: AREAS.station_2.w,
    height: AREAS.station_2.h,
    bounds: { ...STATION2_GEO_BOUNDS }, // 実地理データ由来(issue #3)
    matrix: { ...STATION2_PROJECTION }, // 回転込みアフィン投影(GPS→x/y)
  },
};
