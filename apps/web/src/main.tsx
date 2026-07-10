import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import "@/styles/global.css";

// ページズームを禁止する(ズームはマップの独自ジェスチャのみ許可。issue #155)。
// viewport meta / touch-action では塞げない経路を JS で止める:
// - gesturestart/gesturechange: iOS Safari のピンチ(user-scalable=no を無視する)と
//   macOS Safari のトラックパッドピンチ・スマートズーム
// - ctrlKey 付き wheel: デスクトップのトラックパッドピンチ(ブラウザが ctrl+wheel として発火)
// - Cmd/Ctrl + +/-/=/0: キーボードのページズーム
// マップのズームは pointer イベント + onMapWheel の自前実装(MapGestureController)で
// ブラウザの既定動作に依存しないため、いずれも影響しない。
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && ["+", "-", "=", "_", "0"].includes(e.key)) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
