import type { AreaId } from "@/types/campus";
import { AREA_GEO } from "@/lib/areaRegistry";
import { AreaGeoSvg } from "./AreaGeoSvg";

// 3エリア共通の実地理マップ描画(data/*.geojson.json = OSM を実行時投影・issue #3)。
// areaId でレジストリ(areaRegistry)から shapes / size を引き、AreaGeoSvg に委譲する(issue #105)。
// campus の号館(b1〜b6)の当たり判定とピンは別オーバーレイ(MapView)。
export function AreaSvg({ areaId }: { areaId: AreaId }) {
  const { shapes, size } = AREA_GEO[areaId];
  return <AreaGeoSvg shapes={shapes} width={size.width} height={size.height} />;
}
