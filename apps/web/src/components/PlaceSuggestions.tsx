import { useRoom } from "@/state/RoomContext";

// 空き教室・候補セクション(design/06)。候補一覧 + 「+ 空き教室を追加」パネル(教室配置図 略図)。
export function PlaceSuggestions() {
  const v = useRoom();
  return (
    <>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", color: "#888888" }}>
        PLACES
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "3px 0 8px" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>空き教室・候補</div>
        <div style={{ fontSize: 11.5, color: "#888888" }}>みんなで追加できます</div>
      </div>

      {v.noSuggestions && (
        <div style={{ fontSize: 12.5, color: "#888888", padding: "10px 0" }}>
          まだ候補がありません。空いている教室を見つけたら追加しましょう。
        </div>
      )}

      {v.suggestions.map((s, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderBottom: "1px solid #ebebeb" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 11.5, color: "#888888", marginTop: 1 }}>{s.meta}</div>
          </div>
          <button
            onClick={s.adopt}
            className="hv-border-ink"
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 9999,
              border: "1px solid #a1a1a1",
              background: "#fff",
              color: "#171717",
              fontSize: 11.5,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ここに集合
          </button>
        </div>
      ))}

      {v.addClosed && (
        <button
          onClick={v.toggleAdd}
          className="hv-border-ink"
          style={{
            width: "100%",
            height: 40,
            marginTop: 12,
            borderRadius: 8,
            border: "1px dashed #a1a1a1",
            background: "#fff",
            color: "#4d4d4d",
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          + 空き教室を追加
        </button>
      )}

      {v.addOpen && <AddPanel />}
    </>
  );
}

function AddPanel() {
  const v = useRoom();
  const cellStyle = (rc: { bg: string; fg: string }) =>
    ({
      flex: 1,
      minWidth: 0,
      height: 46,
      border: 0,
      borderLeft: "1px solid #ebebeb",
      marginLeft: -1,
      background: rc.bg,
      color: rc.fg,
      cursor: "pointer",
      fontFamily: "inherit",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
      padding: "0 2px",
    }) as const;
  return (
    <div style={{ border: "1px solid #ebebeb", borderRadius: 8, padding: 12, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={v.addB}
          onChange={v.onAddB}
          style={{ flex: "none", width: 104, height: 34, border: "1px solid #ebebeb", borderRadius: 6, background: "#fff", fontFamily: "inherit", fontSize: 12.5, padding: "0 8px" }}
        >
          {v.buildingOpts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, minWidth: 0 }}>
          {v.addFloorTabs.map((ft) => (
            <button
              key={ft.name}
              onClick={ft.pick}
              style={{
                flex: "none",
                height: 28,
                padding: "0 12px",
                borderRadius: 9999,
                border: `1px solid ${ft.bd}`,
                background: ft.bg,
                color: ft.fg,
                fontFamily: "'Geist Mono',monospace",
                fontSize: 11,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {ft.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#888888" }}>{v.addPlanTitle} ・ 教室をタップ(複数選択可)</span>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9, letterSpacing: ".1em", color: "#888888" }}>
            教室配置図(略図)
          </span>
        </div>
        <div style={{ border: "1.5px solid #a1a1a1", borderRadius: 8, overflow: "hidden", marginTop: 6, background: "#fff" }}>
          <div style={{ display: "flex" }}>
            {v.addPlanTop.map((rc, i) => (
              <button key={i} onClick={rc.pick} style={cellStyle(rc)}>
                <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, fontWeight: 500 }}>{rc.n}</span>
                {rc.t && (
                  <span style={{ fontSize: 8.5, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    {rc.t}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#f5f5f5",
              borderTop: "1px solid #ebebeb",
              borderBottom: "1px solid #ebebeb",
              padding: "0 10px",
              height: 22,
              gap: 10,
            }}
          >
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9, color: "#888888", border: "1px solid #d4d4d4", borderRadius: 3, padding: "0 3px", background: "#fff" }}>
              EV
            </span>
            <span style={{ flex: 1, textAlign: "center", fontSize: 9.5, color: "#888888", letterSpacing: ".4em" }}>廊下</span>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 9, color: "#888888", border: "1px solid #d4d4d4", borderRadius: 3, padding: "0 3px", background: "#fff" }}>
              WC
            </span>
          </div>
          {v.addPlanHasBottom && (
            <div style={{ display: "flex" }}>
              {v.addPlanBottom.map((rc, i) => (
                <button key={i} onClick={rc.pick} style={cellStyle(rc)}>
                  <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, fontWeight: 500 }}>{rc.n}</span>
                  {rc.t && (
                    <span style={{ fontSize: 8.5, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                      {rc.t}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {v.addRSel && (
        <div style={{ fontSize: 11.5, color: "#171717", fontWeight: 500, lineHeight: 1.5 }}>
          選択中({v.addSelCount}):{v.addSelLabel}
        </div>
      )}

      <input
        value={v.addNote}
        onChange={v.onAddNote}
        placeholder="メモ(例:空いてた)"
        style={{ height: 36, border: "1px solid #ebebeb", borderRadius: 6, fontFamily: "inherit", fontSize: 12.5, padding: "0 10px", color: "#171717" }}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={v.toggleAdd}
          style={{ height: 34, padding: "0 14px", borderRadius: 9999, border: "1px solid #ebebeb", background: "#fff", color: "#4d4d4d", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
        >
          キャンセル
        </button>
        <button
          onClick={v.submitAdd}
          style={{ height: 34, padding: "0 16px", borderRadius: 9999, border: 0, background: "#171717", color: "#fff", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
        >
          {v.addSubmitLabel}
        </button>
      </div>
    </div>
  );
}
