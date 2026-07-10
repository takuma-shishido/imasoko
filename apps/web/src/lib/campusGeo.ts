// data/campus.geojson.json(OSM/Overpass の GeoJSON)を実行時に投影して実地理マップを生成する(issue #3)。
// 生成ロジックは areaGeo.buildAreaGeo に共通化。号館(b1〜b6)を基準にフィットし、大きく中心へ配置する。

import rawGeojson from "@/data/campus.geojson.json";
import { buildAreaGeo, featuresOf, type AreaShape } from "./areaGeo";

// OSM way ID → 号館(ユーザー提供の対応)。
const BUILDING_WAYS: Record<string, string> = {
  "387067017": "b1",
  "387067018": "b2",
  "387067016": "b3",
  "184604665": "b4",
  "1075948950": "b5",
  "1031355647": "b6",
};

const geo = buildAreaGeo(featuresOf(rawGeojson), {
  buildingWays: BUILDING_WAYS,
  pad: 0.15,
});

export const CAMPUS_GEO: AreaShape[] = geo.shapes;
export const CAMPUS_BUILDINGS = geo.buildings;
export const CAMPUS_PROJECTION = geo.projection;
export const CAMPUS_GEO_SIZE = geo.size;
export const CAMPUS_GEO_BOUNDS = geo.bounds;
