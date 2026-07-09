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
        bottom: v.toastBottom,
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
            background: COLORS.INK,
            color: COLORS.WHITE,
            fontSize: 12.5,
            padding: "8px 16px",
            borderRadius: 9999,
            boxShadow: "0 4px 14px rgba(0,0,0,.28)",
            animation: "ims-toast-in .2s ease",
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
