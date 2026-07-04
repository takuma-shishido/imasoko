import type { AreaId, AreaDef, MapArea } from "@/types/campus";
import { CAMPUS_GEO_BOUNDS } from "./campusGeo";

// プロトタイプ実行時のエリア定義(模式SVGのワールドサイズ + 距離換算)。
export const AREAS: Record<AreaId, AreaDef> = {
  // campus は実地理(OSM)を 800x640 へ投影(issue #3)。mpp は実 bbox の対角から概算(≒0.85m/px)。
  campus: { name: "有明キャンパス", short: "キャンパス", w: 800, h: 640, mpp: 0.85 },
  station_1: { name: "国際展示場駅", short: "国際展示場", w: 600, h: 480, mpp: 0.35 },
  station_2: { name: "東京テレポート駅", short: "テレポート", w: 600, h: 480, mpp: 0.35 },
};

// 上部エリア切替の並び順(docs/05 §1)。
export const AREA_ORDER: AreaId[] = ["station_1", "station_2", "campus"];

// docs/dev-docs §7:実測キャリブレーション2点(北西角/南東角)。
// campus は data/キャンパス.json(OSM)の実 bbox(campusGeo.ts で生成)。駅2つは実測待ちのプレースホルダ。
export const MAP_AREAS: Record<AreaId, MapArea> = {
  campus: {
    id: "campus",
    name: "有明キャンパス",
    svg: "/map/campus.svg",
    width: AREAS.campus.w,
    height: AREAS.campus.h,
    bounds: { ...CAMPUS_GEO_BOUNDS }, // 実地理データ由来(issue #3)
  },
  station_1: {
    id: "station_1",
    name: "国際展示場駅",
    svg: "/map/station-1.svg",
    width: AREAS.station_1.w,
    height: AREAS.station_1.h,
    bounds: { lat0: 35.636, lng0: 139.794, lat1: 35.634, lng1: 139.797 },
  },
  station_2: {
    id: "station_2",
    name: "東京テレポート駅",
    svg: "/map/station-2.svg",
    width: AREAS.station_2.w,
    height: AREAS.station_2.h,
    bounds: { lat0: 35.627, lng0: 139.777, lat1: 35.624, lng1: 139.78 },
  },
};
