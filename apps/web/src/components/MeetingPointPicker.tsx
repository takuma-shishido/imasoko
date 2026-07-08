import { useRoom } from "@/state/RoomContext";
import { Button } from "./ui/Button";
import { Radio } from "./ui/Radio";
import { PlaceSuggestions } from "./PlaceSuggestions";
import { COLORS } from "@/lib/theme";

// 集合場所シート(design/06)。3タイプ(coords / member / place)の指定 + 空き教室候補。
export function MeetingPointPicker() {
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
        MEETING POINT
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 12px" }}>集合場所を決める</div>

      {v.meetingSet && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: COLORS.BG,
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: COLORS.BLUE,
              transform: "rotate(45deg)",
              flex: "none",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{v.meetingLabel}</div>
            <div style={{ fontSize: 11.5, color: COLORS.GRAY }}>{v.meetingByLabel}</div>
          </div>
          <button
            onClick={v.clearMeeting}
            className="hv-border"
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 9999,
              border: `1px solid ${COLORS.BORDER}`,
              background: COLORS.WHITE,
              color: COLORS.SUBTLE,
              fontSize: 11.5,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            解除
          </button>
        </div>
      )}

      {/* coords */}
      <div
        onClick={v.mtPickCoords}
        style={{
          padding: "12px 4px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radio dot={v.mtDotCoords} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>地図にピンを立てる</div>
            <div style={{ fontSize: 11.5, color: COLORS.GRAY }}>
              好きな地点をタップ。説明も付けられます
            </div>
          </div>
        </div>
        {v.mtIsCoords && (
          <div style={{ margin: "10px 0 2px 26px" }}>
            <button
              onClick={v.startPick}
              style={{
                height: 32,
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
              地図で指定
            </button>
          </div>
        )}
      </div>

      {/* member */}
      <div
        onClick={v.mtPickMember}
        style={{
          padding: "12px 4px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radio dot={v.mtDotMember} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>誰かのところ</div>
            <div style={{ fontSize: 11.5, color: COLORS.GRAY }}>
              その人が動くと集合地点も追従します
            </div>
          </div>
        </div>
        {v.mtIsMember && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 2px 26px" }}>
            {v.memberChips.map((mc, i) => (
              <button
                key={i}
                onClick={mc.pick}
                style={{
                  height: 30,
                  padding: "0 13px",
                  borderRadius: 9999,
                  border: `1px solid ${mc.bd}`,
                  background: mc.bg,
                  color: mc.fg,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {mc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* place */}
      <div onClick={v.mtPickPlace} style={{ padding: "12px 4px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radio dot={v.mtDotPlace} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>場所から選ぶ</div>
            <div style={{ fontSize: 11.5, color: COLORS.GRAY }}>
              教室・「◯号館前」などのランドマーク
            </div>
          </div>
        </div>
        {v.mtIsPlace && (
          <div style={{ display: "flex", gap: 8, margin: "10px 0 2px 26px" }}>
            <select
              value={v.placeB}
              onChange={v.onPlaceB}
              style={{
                flex: 1,
                height: 36,
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 6,
                background: COLORS.WHITE,
                fontFamily: "inherit",
                fontSize: 12.5,
                color: COLORS.INK,
                padding: "0 8px",
                minWidth: 0,
              }}
            >
              {v.buildingOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={v.placeR}
              onChange={v.onPlaceR}
              style={{
                flex: 1.3,
                height: 36,
                border: `1px solid ${COLORS.BORDER}`,
                borderRadius: 6,
                background: COLORS.WHITE,
                fontFamily: "inherit",
                fontSize: 12.5,
                color: COLORS.INK,
                padding: "0 8px",
                minWidth: 0,
              }}
            >
              <option value="">場所を選択</option>
              {v.placeOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginTop: 6 }}>
        <Button variant="primary" size="md" disabled={v.mtApplyDisabled} onClick={v.mtApply}>
          この場所にする
        </Button>
      </div>

      <div style={{ borderTop: `1px solid ${COLORS.BORDER}`, margin: "20px -20px 16px" }} />

      <PlaceSuggestions />
    </div>
  );
}
