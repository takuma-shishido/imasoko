import { useRoom } from "@/state/RoomContext";

// プロトタイプの DEMO パネル(状態切替)。実アプリでは動作確認用に残している。
export function DemoControls() {
  const v = useRoom();
  return (
    <>
      {v.demoOpen && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: v.demoPanelBottom,
            zIndex: 61,
            width: 238,
            background: "#171717",
            borderRadius: 10,
            boxShadow: "0 12px 30px rgba(0,0,0,.35)",
            padding: 8,
            animation: "ims-fade-in .15s ease",
          }}
        >
          <div
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 9.5,
              letterSpacing: ".14em",
              color: "#888888",
              padding: "4px 8px 6px",
            }}
          >
            DEMO CONTROLS ・ 状態切替
          </div>
          {v.demoActions.map((d, i) => (
            <button
              key={i}
              onClick={d.run}
              className="hv-panel"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: 0,
                color: "#ffffff",
                fontSize: 12,
                padding: 8,
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {v.demoChipOn && (
        <button
          onClick={v.toggleDemo}
          style={{
            position: "absolute",
            right: 12,
            bottom: v.demoBtnBottom,
            zIndex: 60,
            height: 26,
            padding: "0 11px",
            borderRadius: 9999,
            background: "#171717",
            color: "#fff",
            border: 0,
            fontFamily: "'Geist Mono',monospace",
            fontSize: 9.5,
            letterSpacing: ".12em",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,.28)",
          }}
        >
          DEMO
        </button>
      )}
    </>
  );
}
