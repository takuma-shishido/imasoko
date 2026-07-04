import type { AreaShape } from "@/lib/areaGeo";

// 実地理マップ(GeoJSON を実行時投影)の共通レンダラ(issue #3)。
// 建物/土地は面、道(footway 等)は線で描画。ref 付き(対応建物=号館など)は
// 角丸カードのオーバーレイで別途表示するため、ここでは実フットプリントを描かない。
const FILL: Record<"building" | "land" | "other", { fill: string; stroke: string }> = {
  building: { fill: "#e3e3e3", stroke: "#bcbcbc" },
  land: { fill: "#eef2ec", stroke: "#dde6d9" },
  other: { fill: "#f0f0f0", stroke: "#e4e4e4" },
};

export function AreaGeoSvg({
  shapes,
  width,
  height,
}: {
  shapes: AreaShape[];
  width: number;
  height: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0, display: "block" }}
    >
      <rect width={width} height={height} fill="#f7f7f7" />
      {shapes.map((s, i) => {
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
