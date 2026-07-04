import { STATION1_GEO, STATION1_GEO_SIZE } from "@/lib/station1Geo";
import { AreaGeoSvg } from "./AreaGeoSvg";

// 国際展示場駅の実地理マップ(data/station1.geojson.json = OSM を実行時投影・issue #3)。
export function Station1Svg() {
  return (
    <AreaGeoSvg
      shapes={STATION1_GEO}
      width={STATION1_GEO_SIZE.width}
      height={STATION1_GEO_SIZE.height}
    />
  );
}
