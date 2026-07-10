// 3エリア(campus / station_1 / station_2)の実地理マップ生成物を単一レジストリに集約する(issue #105)。
// 各 *Geo.ts が buildAreaGeo で生成した shapes / projection / size / bounds を AreaId 毎にまとめ、
// AreaSvg・mapAreas・MapView から手書き列挙せず参照できるようにする(値は各 *Geo.ts の export と同一)。

import type { AreaId } from "@/types/campus";
import type { AreaGeo } from "./areaGeo";
import { CAMPUS_GEO, CAMPUS_PROJECTION, CAMPUS_GEO_SIZE, CAMPUS_GEO_BOUNDS } from "./campusGeo";
import {
  STATION1_GEO,
  STATION1_PROJECTION,
  STATION1_GEO_SIZE,
  STATION1_GEO_BOUNDS,
} from "./station1Geo";
import {
  STATION2_GEO,
  STATION2_PROJECTION,
  STATION2_GEO_SIZE,
  STATION2_GEO_BOUNDS,
} from "./station2Geo";

/** エリア1つ分の実地理マップ生成物(描画 shapes + GPS 投影 + サイズ + 判定 bbox)。 */
export type AreaGeoBundle = Pick<AreaGeo, "shapes" | "projection" | "size" | "bounds">;

/** AreaId → 実地理マップ生成物。各 *Geo.ts の export を参照するだけで値は不変。 */
export const AREA_GEO: Record<AreaId, AreaGeoBundle> = {
  campus: {
    shapes: CAMPUS_GEO,
    projection: CAMPUS_PROJECTION,
    size: CAMPUS_GEO_SIZE,
    bounds: CAMPUS_GEO_BOUNDS,
  },
  station_1: {
    shapes: STATION1_GEO,
    projection: STATION1_PROJECTION,
    size: STATION1_GEO_SIZE,
    bounds: STATION1_GEO_BOUNDS,
  },
  station_2: {
    shapes: STATION2_GEO,
    projection: STATION2_PROJECTION,
    size: STATION2_GEO_SIZE,
    bounds: STATION2_GEO_BOUNDS,
  },
};
