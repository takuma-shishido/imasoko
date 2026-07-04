// 国際展示場駅の模式マップ(プロトタイプのインラインSVGを移植)。
export function Station1Svg() {
  return (
    <svg
      width="600"
      height="480"
      viewBox="0 0 600 480"
      style={{ position: "absolute", left: 0, top: 0, display: "block" }}
    >
      <rect width="600" height="480" fill="#f5f5f5" />
      <rect x="0" y="130" width="600" height="70" fill="#e8e8e8" />
      <line
        x1="0"
        y1="165"
        x2="600"
        y2="165"
        stroke="#c4c4c4"
        strokeWidth="2"
        strokeDasharray="16 12"
      />
      <rect
        x="210"
        y="200"
        width="180"
        height="86"
        rx="8"
        fill="#ffffff"
        stroke="#a1a1a1"
        strokeWidth="1.5"
      />
      <rect x="0" y="340" width="600" height="36" fill="#ececec" />
      <rect
        x="140"
        y="300"
        width="26"
        height="26"
        rx="4"
        fill="#ffffff"
        stroke="#a1a1a1"
        strokeWidth="1.5"
      />
      <rect
        x="430"
        y="300"
        width="26"
        height="26"
        rx="4"
        fill="#ffffff"
        stroke="#a1a1a1"
        strokeWidth="1.5"
      />
    </svg>
  );
}
