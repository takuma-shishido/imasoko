import { useRoom } from "@/state/RoomContext";
import { COLORS } from "@/lib/theme";

export function Toasts() {
  const v = useRoom();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: v.toastTop,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      {v.toasts.map((t) => (
        <div
          key={t.id}
          style={{
            // 半透明 + 背景ぼかしで背後(地図など)がうっすら見えるようにする
            background: "rgba(23, 23, 23, 0.78)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)", // iOS Safari はベンダープレフィックスが必要
            color: COLORS.WHITE,
            fontSize: 12.5,
            padding: "8px 16px",
            borderRadius: 9999,
            boxShadow: "0 4px 14px rgba(0,0,0,.28)",
            // forwards で退場アニメ終了時の透明状態を削除まで維持する
            animation: t.closing ? "ims-toast-out .2s ease forwards" : "ims-toast-in .2s ease",
            maxWidth: "85%",
            textAlign: "center",
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
