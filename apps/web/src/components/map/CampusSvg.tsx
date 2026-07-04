import { CAMPUS_GEO, CAMPUS_GEO_SIZE } from "@/lib/campusGeo";

// 有明キャンパスの実地理マップ(data/campus.geojson.json = OSM を実行時投影・issue #3)。
// 建物/土地は面、道(footway 等)は線で描画する。b1〜b6 の当たり判定とピンは別オーバーレイ。
const FILL: Record<"building" | "land" | "other", { fill: string; stroke: string }> = {
  building: { fill: "#e3e3e3", stroke: "#bcbcbc" },
  land: { fill: "#eef2ec", stroke: "#dde6d9" },
  other: { fill: "#f0f0f0", stroke: "#e4e4e4" },
};

export function CampusSvg() {
  const { width, height } = CAMPUS_GEO_SIZE;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0, display: "block" }}
    >
      <rect width={width} height={height} fill="#f7f7f7" />
      {CAMPUS_GEO.map((s, i) => {
        // 号館(b1〜b6)は角丸カードのオーバーレイ(MapView)で表現するため、四角い実フットプリントは描かない。
        if (s.ref) return null;
        if (s.kind === "road") {
          return (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke="#dadada"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        const c = FILL[s.kind];
        return (
          <path
            key={i}
            d={s.d}
            fill={c.fill}
            stroke={c.stroke}
            strokeWidth={1}
            fillRule="evenodd"
          />
        );
      })}
    </svg>
  );
}
