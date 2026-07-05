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
      <div
        style={{
          display: "flex",
          background: "#f5f5f5",
          borderRadius: 9999,
          padding: 3,
          flex: 1,
          gap: 2,
        }}
      >
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
      {/* 残り時間:ラベル付きチップで「何の時間か」を明示し、右端に埋もれないようにする(issue #32) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flex: "none",
          background: "#f5f5f5",
          borderRadius: 9999,
          padding: "4px 10px",
        }}
      >
        <span style={{ fontSize: 10.5, color: "#888888", fontWeight: 500, whiteSpace: "nowrap" }}>
          残り
        </span>
        <span
          style={{
            fontFamily: "'Geist Mono',monospace",
            fontSize: 12.5,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: v.timerColor,
          }}
        >
          {v.remainingShort}
        </span>
      </div>
    </div>
  );
}
