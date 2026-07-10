import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// 配信オリジン(index.html の %VITE_PUBLIC_ORIGIN% = og:url / og:image に使用)。
// 未指定・空なら本番ドメイン。dev 環境は deploy.yml が build arg で差し替える(issue #160)。
if (!process.env.VITE_PUBLIC_ORIGIN) process.env.VITE_PUBLIC_ORIGIN = "https://imasoko.reimpl.com";

// dev-docs §9 / docs/02 §3:同一オリジン配信のため、開発時のみ /api・/ws を :8000 へプロキシ。
export default defineConfig({
  plugins: [react()],
  // アプリのバージョン(package.json の version が単一ソース)。UI 表記用にビルド時へ注入する。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
