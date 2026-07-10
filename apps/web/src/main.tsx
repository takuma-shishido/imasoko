import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import "@/styles/global.css";

// iOS Safari は viewport の user-scalable=no を無視するため、Safari 独自の
// gesturestart(2本指ピンチ開始)を止めてページズームを禁止する。
// マップのピンチは pointer イベント実装(MapGestureController)なので影響しない。
document.addEventListener("gesturestart", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
