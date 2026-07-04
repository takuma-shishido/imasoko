// 有明キャンパスの模式マップ(プロトタイプのインラインSVGを移植)。
// 実地理トレースSVG(docs/dev-docs §7)への差し替えを想定した暫定図。
export function CampusSvg() {
  return (
    <svg
      width="800"
      height="640"
      viewBox="0 0 800 640"
      style={{ position: "absolute", left: 0, top: 0, display: "block" }}
    >
      <rect width="800" height="640" fill="#f5f5f5" />
      {/* 道路:北側(有明三丁目 東西)+ ブロック間(南北) */}
      <rect x="0" y="30" width="800" height="44" fill="#e8e8e8" />
      <line
        x1="0"
        y1="52"
        x2="800"
        y2="52"
        stroke="#c9c9c9"
        strokeWidth="1.5"
        strokeDasharray="14 10"
      />
      <rect x="480" y="30" width="64" height="610" fill="#e8e8e8" />
      <line
        x1="512"
        y1="30"
        x2="512"
        y2="640"
        stroke="#c9c9c9"
        strokeWidth="1.5"
        strokeDasharray="14 10"
      />
      <rect x="488" y="82" width="48" height="5" fill="#ffffff" />
      <rect x="488" y="92" width="48" height="5" fill="#ffffff" />
      {/* 敷地(西ブロック/東ブロック) */}
      <rect x="40" y="92" width="420" height="472" rx="14" fill="#efefef" />
      <rect x="562" y="200" width="222" height="272" rx="14" fill="#efefef" />
      {/* 5号館・4号館の連絡部 */}
      <rect
        x="618"
        y="284"
        width="32"
        height="58"
        fill="#ffffff"
        stroke="#a1a1a1"
        strokeWidth="1.5"
      />
      {/* プロムナード(正門〜北)+ モニュメント門への連絡路 */}
      <rect x="238" y="180" width="40" height="360" fill="#e4e4e4" />
      <rect x="238" y="336" width="216" height="34" fill="#e4e4e4" />
      {/* 正門(南)/ モニュメント門(東) */}
      <rect x="232" y="536" width="52" height="8" rx="2" fill="#a1a1a1" />
      <rect x="450" y="332" width="8" height="42" rx="2" fill="#a1a1a1" />
      {/* 植栽 */}
      <circle cx="70" cy="590" r="20" fill="#e6e6e6" />
      <circle cx="120" cy="608" r="14" fill="#e6e6e6" />
      <circle cx="360" cy="590" r="18" fill="#e6e6e6" />
      <circle cx="600" cy="500" r="16" fill="#e6e6e6" />
      <circle cx="700" cy="512" r="20" fill="#e6e6e6" />
      <circle cx="64" cy="130" r="14" fill="#e6e6e6" />
    </svg>
  );
}
