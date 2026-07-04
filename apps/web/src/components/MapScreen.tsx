import type { ReactNode } from "react";
import { useRoom } from "@/state/RoomContext";
import { AreaSwitcher } from "./AreaSwitcher";
import { MapView } from "./MapView";

// ルームメイン(地図)= design/04。上部エリア切替 + 状態バー + 地図 + 下部操作バー。
export function MapScreen() {
  const v = useRoom();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
      }}
    >
      <AreaSwitcher />

      {v.reconnecting && (
        <div
          style={{
            background: "#ffefcf",
            color: "#ab570a",
            fontSize: 12,
            textAlign: "center",
            padding: 6,
            animation: "ims-blink 1.4s infinite",
          }}
        >
          再接続中…
        </div>
      )}

      {v.viewerOnly && (
        <div
          style={{
            background: "#f5f5f5",
            borderBottom: "1px solid #ebebeb",
            fontSize: 12,
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              background: "#171717",
              color: "#fff",
              borderRadius: 9999,
              fontSize: 10,
              padding: "2px 8px",
            }}
          >
            閲覧のみ
          </span>
          <span style={{ color: "#4d4d4d", flex: 1 }}>自分の位置は共有されていません</span>
          <button
            onClick={v.sharePosAgain}
            style={{
              background: "none",
              border: 0,
              color: "#0070f3",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            位置を共有する
          </button>
        </div>
      )}

      <MapView />

      <div
        style={{
          borderTop: "1px solid #ebebeb",
          background: "#fff",
          position: "relative",
          zIndex: 5,
        }}
      >
        <div
          onClick={v.openMembers}
          className="hv-bg-soft"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "7px 16px 4px",
            cursor: "pointer",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 9999, background: "#d9d9d9" }} />
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 6 }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>参加者 {v.memberCount}人</span>
            <span style={{ fontSize: 11.5, color: "#888888", flex: 1 }}>{v.areaSummary}</span>
            <span style={{ fontSize: 11, color: "#0070f3" }}>一覧 ↑</span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            padding: "4px 8px 10px",
            gap: 2,
          }}
        >
          <ActionButton onClick={v.openMeeting} label="集合場所">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="5.2" y="5.2" width="7.6" height="7.6" transform="rotate(45 9 9)" />
            </svg>
          </ActionButton>
          <ActionButton onClick={v.openBuilding} label="建物" opacity={v.buildingBtnOpacity}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="4" y="2.5" width="10" height="13" rx="1" />
              <path d="M7 5.5h1M10.5 5.5h1M7 8.5h1M10.5 8.5h1M8 15.5v-3h2v3" />
            </svg>
          </ActionButton>
          <ActionButton onClick={v.openPlaces} label="空き教室">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="4.5" y="2.5" width="9" height="13" rx="1" />
              <circle cx="11" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
              <path d="M2.5 15.5h13" />
            </svg>
          </ActionButton>
          <ActionButton onClick={v.openShare} label="共有">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="4.8" cy="9" r="2" />
              <circle cx="13.2" cy="4.4" r="2" />
              <circle cx="13.2" cy="13.6" r="2" />
              <path d="M6.6 8L11.4 5.4M6.6 10l4.8 2.6" />
            </svg>
          </ActionButton>
          <ActionButton onClick={v.openSettings} label="設定">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2.5 5.5h13M2.5 12.5h13" />
              <circle cx="7" cy="5.5" r="1.9" fill="#fff" />
              <circle cx="11" cy="12.5" r="1.9" fill="#fff" />
            </svg>
          </ActionButton>
          <ActionButton onClick={v.tapLeave} label="退出" color="#ee0000" hoverClass="hv-bg-err">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M11 2.5H4v13h7" />
              <path d="M8 9h7.5M13 6l3 3-3 3" />
            </svg>
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  children,
  opacity = "1",
  color = "#171717",
  hoverClass = "hv-bg",
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  opacity?: string;
  color?: string;
  hoverClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={hoverClass}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: 0,
        padding: "7px 0",
        borderRadius: 8,
        cursor: "pointer",
        color,
        fontFamily: "inherit",
        opacity,
      }}
    >
      {children}
      <span style={{ fontSize: 10 }}>{label}</span>
    </button>
  );
}
