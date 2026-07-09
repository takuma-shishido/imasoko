import type { AreaId, AreaDef, MapArea } from "@/types/campus";
import { AREA_GEO } from "./areaRegistry";

// プロトタイプ実行時のエリア定義(実地理マップのワールドサイズ + 距離換算)。
// 3エリアとも OSM GeoJSON を 800x640 へ実行時投影(issue #3)。mpp は概算(距離表示は #28 で GPS 実測へ移行済み)。
export const AREAS: Record<AreaId, AreaDef> = {
  campus: { name: "有明キャンパス", short: "キャンパス", w: 800, h: 640, mpp: 0.85 },
  station_1: { name: "国際展示場駅", short: "国際展示場", w: 800, h: 640, mpp: 0.5 },
  station_2: { name: "東京テレポート駅", short: "テレポート", w: 800, h: 640, mpp: 0.5 },
};

// 上部エリア切替の並び順(docs/05 §1)。
export const AREA_ORDER: AreaId[] = ["station_2", "campus", "station_1"];

// 各エリアの map SVG パス(静的アセット)。
const AREA_SVG_PATH: Record<AreaId, string> = {
  campus: "/map/campus.svg",
  station_1: "/map/station-1.svg",
  station_2: "/map/station-2.svg",
};

// docs/dev-docs §7:実測キャリブレーション2点(北西角/南東角)。
// bounds / matrix は実地理データ由来(areaRegistry = 各 *Geo.ts で生成・issue #3)。
// エリア毎の手書き列挙をやめ、AREAS + AREA_GEO から一括生成する(値は不変・issue #105)。
export const MAP_AREAS: Record<AreaId, MapArea> = Object.fromEntries(
  (Object.keys(AREAS) as AreaId[]).map((id) => [
    id,
    {
      id,
      name: AREAS[id].name,
      svg: AREA_SVG_PATH[id],
      width: AREAS[id].w,
      height: AREAS[id].h,
      bounds: { ...AREA_GEO[id].bounds }, // エリア判定用 bbox
      matrix: { ...AREA_GEO[id].projection }, // 回転込みアフィン投影(GPS→x/y)
    },
  ])
) as Record<AreaId, MapArea>;
