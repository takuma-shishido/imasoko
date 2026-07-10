// 東京テレポート駅の実地理マップ(data/station2.geojson.json = OSM を実行時投影・issue #3)。
// 号館のような対応建物は無いので、全ポリゴン(建物/土地)を基準にフィットする。

import rawGeojson from "@/data/station2.geojson.json";
import { buildAreaGeo, featuresOf } from "./areaGeo";

const geo = buildAreaGeo(featuresOf(rawGeojson), { pad: 0.12 });

export const STATION2_GEO = geo.shapes;
export const STATION2_PROJECTION = geo.projection;
export const STATION2_GEO_SIZE = geo.size;
export const STATION2_GEO_BOUNDS = geo.bounds;
