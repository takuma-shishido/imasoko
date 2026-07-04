import { useRoom } from "@/state/RoomContext";

// 上部エリア切替(3セグメント)+ 残り時間(docs/05 §1 / design/04)。
export function AreaSwitcher() {
  const v = useRoom();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderBottom: "1px solid #ebebeb",
        background: "#fff",
        position: "relative",
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", background: "#f5f5f5", borderRadius: 9999, padding: 3, flex: 1, gap: 2 }}>
        {v.areasSeg.map((a) => (
          <button
            key={a.label}
            onClick={a.pick}
            style={{
              flex: 1,
              height: 30,
              borderRadius: 9999,
              border: 0,
              fontSize: 11.5,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              background: a.bg,
              color: a.fg,
              whiteSpace: "nowrap",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 12,
          fontWeight: 500,
          minWidth: 44,
          textAlign: "right",
          color: v.timerColor,
        }}
      >
        {v.remainingShort}
      </div>
    </div>
  );
}
