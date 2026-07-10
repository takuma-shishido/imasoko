// 国際展示場駅の実地理マップ(data/station1.geojson.json = OSM を実行時投影・issue #3)。
// 号館のような対応建物は無いので、全ポリゴン(建物/土地)を基準にフィットする。

import rawGeojson from "@/data/station1.geojson.json";
import { buildAreaGeo, featuresOf } from "./areaGeo";

const geo = buildAreaGeo(featuresOf(rawGeojson), { pad: 0.12 });

export const STATION1_GEO = geo.shapes;
export const STATION1_PROJECTION = geo.projection;
export const STATION1_GEO_SIZE = geo.size;
export const STATION1_GEO_BOUNDS = geo.bounds;
