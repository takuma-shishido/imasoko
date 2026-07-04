// 東京テレポート駅の模式マップ(プロトタイプのインラインSVGを移植)。
export function Station2Svg() {
  return (
    <svg
      width="600"
      height="480"
      viewBox="0 0 600 480"
      style={{ position: "absolute", left: 0, top: 0, display: "block" }}
    >
      <rect width="600" height="480" fill="#f5f5f5" />
      <rect x="0" y="90" width="600" height="70" fill="#e8e8e8" />
      <line
        x1="0"
        y1="125"
        x2="600"
        y2="125"
        stroke="#c4c4c4"
        strokeWidth="2"
        strokeDasharray="16 12"
      />
      <rect
        x="180"
        y="160"
        width="240"
        height="84"
        rx="8"
        fill="#ffffff"
        stroke="#a1a1a1"
        strokeWidth="1.5"
      />
      <rect
        x="180"
        y="300"
        width="150"
        height="66"
        rx="8"
        fill="#ececec"
        stroke="#d4d4d4"
        strokeWidth="1.5"
      />
      <circle cx="460" cy="340" r="42" fill="#ececec" />
    </svg>
  );
}
