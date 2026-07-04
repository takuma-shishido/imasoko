import { STATION2_GEO, STATION2_GEO_SIZE } from "@/lib/station2Geo";
import { AreaGeoSvg } from "./AreaGeoSvg";

// 東京テレポート駅の実地理マップ(data/station2.geojson.json = OSM を実行時投影・issue #3)。
export function Station2Svg() {
  return (
    <AreaGeoSvg
      shapes={STATION2_GEO}
      width={STATION2_GEO_SIZE.width}
      height={STATION2_GEO_SIZE.height}
    />
  );
}
