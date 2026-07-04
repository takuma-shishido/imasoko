import type { AreaId, AreaDef, MapArea } from "@/types/campus";

// プロトタイプ実行時のエリア定義(模式SVGのワールドサイズ + 距離換算)。
export const AREAS: Record<AreaId, AreaDef> = {
  campus: { name: "有明キャンパス", short: "キャンパス", w: 800, h: 640, mpp: 0.5 },
  station_1: { name: "国際展示場駅", short: "国際展示場", w: 600, h: 480, mpp: 0.35 },
  station_2: { name: "東京テレポート駅", short: "テレポート", w: 600, h: 480, mpp: 0.35 },
};

// 上部エリア切替の並び順(docs/05 §1)。
export const AREA_ORDER: AreaId[] = ["station_1", "station_2", "campus"];

// docs/dev-docs §7:実測キャリブレーション2点(北西角/南東角)。
// ※ 値はプレースホルダ(有明周辺の概算・互いに重ならない矩形)。実測後に差し替える(docs/02 §6 の運用)。
export const MAP_AREAS: Record<AreaId, MapArea> = {
  campus: {
    id: "campus",
    name: "有明キャンパス",
    svg: "/map/campus.svg",
    width: AREAS.campus.w,
    height: AREAS.campus.h,
    bounds: { lat0: 35.634, lng0: 139.792, lat1: 35.63, lng1: 139.796 },
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
