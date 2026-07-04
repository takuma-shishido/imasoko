import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RoomProvider, useRoom } from "@/state/RoomContext";
import { TopPage } from "@/pages/TopPage";
import { PublicRoomsPage } from "@/pages/PublicRoomsPage";
import { RoomPage } from "@/pages/RoomPage";
import { RoomSheets } from "@/components/RoomSheets";
import { RoomModals } from "@/components/RoomModals";
import { Toasts } from "@/components/Toasts";
import { DemoControls } from "@/components/DemoControls";

// スマホ縦の枠(max-width 430px 中央寄せ)。design/00 の共通レイアウト。
function Frame() {
  const v = useRoom();
  const navigate = useNavigate();
  const loc = useLocation();
  const bootRef = useRef(false);
  const leftTop = useRef(false);

  // 共有リンク(/r/:id)で開かれたら、初回だけ実サーバーへ存在チェック(issue #13)。
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const m = loc.pathname.match(/^\/r\/([^/]+)$/);
    if (m) v.openRoomById(decodeURIComponent(m[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画面状態を URL に反映(/, /public, /r/:id)。design/00 の SPA ルーティング。
  useEffect(() => {
    if (!v.isTop) leftTop.current = true;
    // 共有リンク起動直後(まだ一度も top を離れず存在チェック中)は URL を潰さない。
    if (v.isTop && !leftTop.current && /^\/r\//.test(loc.pathname)) return;
    const path = v.isTop ? "/" : v.isPublic ? "/public" : `/r/${v.roomId}`;
    if (loc.pathname !== path) navigate(path, { replace: true });
  }, [v.screen, v.roomId, loc.pathname, navigate, v.isTop, v.isPublic]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#fafafa",
        display: "flex",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        color: "#171717",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          height: "100dvh",
          background: "#ffffff",
          borderLeft: "1px solid #ebebeb",
          borderRight: "1px solid #ebebeb",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {v.isTop ? <TopPage /> : v.isPublic ? <PublicRoomsPage /> : <RoomPage />}

        {/* グローバル・オーバーレイ(枠内に重畳) */}
        <RoomSheets />
        <RoomModals />
        <Toasts />
        <DemoControls />
      </div>
    </div>
  );
}

export function App() {
  return (
    <RoomProvider>
      <Frame />
    </RoomProvider>
  );
}
