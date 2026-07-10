import { useRoom } from "@/state/RoomContext";
import { COLORS } from "@/lib/theme";

// 建物ドリルダウンシート(design/05)。建物選択 → 階アコーディオン → 教室、+ 階ごとメンバー。
export function CampusView() {
  const v = useRoom();
  return (
    <div>
      <div
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 10.5,
          letterSpacing: ".14em",
          color: COLORS.GRAY,
        }}
      >
        BUILDINGS
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 12px" }}>建物から探す</div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 12px" }}>
        {v.buildingChips.map((bc) => (
          <button
            key={bc.name}
            onClick={bc.pick}
            style={{
              flex: "none",
              height: 32,
              padding: "0 14px",
              borderRadius: 9999,
              border: `1px solid ${bc.bd}`,
              background: bc.bg,
              color: bc.fg,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {bc.name}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: COLORS.BG,
          borderRadius: 8,
          padding: "10px 12px",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>
          <span style={{ whiteSpace: "nowrap" }}>{v.spotLabel}</span>
          <span
            style={{ color: COLORS.GRAY, fontWeight: 400, fontSize: 11.5, whiteSpace: "nowrap" }}
          >
            {" "}
            ・ 屋外ランドマーク
          </span>
        </div>
        <button
          onClick={v.spotMeet}
          className="hv-border-ink"
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 9999,
            border: `1px solid ${COLORS.MUTED}`,
            background: COLORS.WHITE,
            color: COLORS.INK,
            fontSize: 11.5,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          集合場所にする
        </button>
      </div>

      {v.floorRows.map((f) => (
        <div
          key={f.level}
          style={{
            border: `1px solid ${COLORS.BORDER}`,
            borderRadius: 8,
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          <div
            onClick={f.toggle}
            className="hv-bg-soft"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              cursor: "pointer",
              background: COLORS.WHITE,
            }}
          >
            <span
              style={{
                fontFamily: "'Geist Mono',monospace",
                fontSize: 12.5,
                fontWeight: 500,
                width: 26,
                flex: "none",
              }}
            >
              {f.level}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: COLORS.GRAY,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f.sub}
            </span>
            {f.names && (
              <span
                style={{
                  fontSize: 11.5,
                  color: COLORS.INK,
                  fontWeight: 500,
                  background: COLORS.BG,
                  borderRadius: 9999,
                  padding: "2px 9px",
                  whiteSpace: "nowrap",
                }}
              >
                {f.names}
              </span>
            )}
            <button
              onClick={f.here}
              className="hv-border"
              style={{
                height: 26,
                padding: "0 10px",
                borderRadius: 9999,
                border: `1px solid ${COLORS.BORDER}`,
                background: COLORS.WHITE,
                color: COLORS.SUBTLE,
                fontSize: 10.5,
                fontFamily: "inherit",
                cursor: "pointer",
                flex: "none",
              }}
            >
              ここにいる
            </button>
            <span style={{ color: COLORS.GRAY, fontSize: 11, flex: "none" }}>{f.arrow}</span>
          </div>
          {f.open && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 14px",
                borderTop: `1px solid ${COLORS.BORDER}`,
                background: COLORS.FAINT,
              }}
            >
              {f.rooms.map((rm, i) => (
                <button
                  key={i}
                  onClick={rm.pick}
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: 6,
                    border: `1px solid ${rm.bd}`,
                    background: rm.bg,
                    color: rm.fg,
                    fontSize: 12.5,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {rm.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {v.roomSel && (
        <div
          style={{
            position: "sticky",
            bottom: -24,
            background: COLORS.WHITE,
            borderTop: `1px solid ${COLORS.BORDER}`,
            padding: "12px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {v.roomSelLabel}
          </div>
          <button
            onClick={v.roomSuggest}
            className="hv-border-ink"
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: 9999,
              border: `1px solid ${COLORS.MUTED}`,
              background: COLORS.WHITE,
              color: COLORS.INK,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            空き教室に共有
          </button>
          <button
            onClick={v.roomMeet}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 9999,
              border: 0,
              background: COLORS.INK,
              color: COLORS.WHITE,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            集合場所にする
          </button>
        </div>
      )}
    </div>
  );
}
