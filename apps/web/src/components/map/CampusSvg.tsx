import { CAMPUS_GEO, CAMPUS_GEO_SIZE } from "@/lib/campusGeo";
import { AreaGeoSvg } from "./AreaGeoSvg";

// 有明キャンパスの実地理マップ(data/campus.geojson.json = OSM を実行時投影・issue #3)。
// b1〜b6 の当たり判定とピンは別オーバーレイ(MapView)。
export function CampusSvg() {
  return (
    <AreaGeoSvg shapes={CAMPUS_GEO} width={CAMPUS_GEO_SIZE.width} height={CAMPUS_GEO_SIZE.height} />
  );
}
