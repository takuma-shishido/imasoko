import { useRoom } from "@/state/RoomContext";
import { Input } from "./ui/Input";
import { Radio } from "./ui/Radio";
import { COLORS } from "@/lib/theme";

// 設定シート(design/07)。公開範囲(host のみ)+ 残り/集合時間 + 集合時間変更 + 退出。
export function RoomVisibility() {
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
        SETTINGS
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 12px" }}>ルームの設定</div>

      {v.isHost && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div
              style={{
                fontFamily: "'Geist Mono',monospace",
                fontSize: 10.5,
                letterSpacing: ".14em",
                color: COLORS.GRAY,
              }}
            >
              VISIBILITY
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.GRAY }}>host のみ</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, margin: "3px 0 6px" }}>公開範囲</div>

          <div
            onClick={v.pickPrivate}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 4px",
              cursor: "pointer",
            }}
          >
            <Radio selected={!v.visPublic} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                非公開<span style={{ color: COLORS.GRAY, fontWeight: 400 }}>(既定)</span>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.GRAY }}>
                URLを知っている人だけが参加できます
              </div>
            </div>
          </div>

          <div
            onClick={v.pickPublic}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "11px 4px",
              cursor: "pointer",
            }}
          >
            <Radio selected={v.visPublic} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>公開</div>
              <div style={{ fontSize: 11.5, color: COLORS.AMBER }}>
                公開ルーム一覧に載り、誰でも参加できます
              </div>
            </div>
          </div>

          {v.visPublic && (
            <div style={{ margin: "6px 0 0 26px" }}>
              <Input
                size="md"
                label="ルーム名(公開一覧に表示)"
                placeholder="例:サッカー部 集合"
                value={v.titleVal}
                onChange={v.onTitle}
              />
            </div>
          )}
        </>
      )}

      <div style={{ borderTop: `1px solid ${COLORS.BORDER}`, margin: "20px -20px 16px" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12.5, color: COLORS.SUBTLE }}>残り時間</span>
        <span
          style={{
            fontFamily: "'Geist Mono',monospace",
            fontSize: 13,
            fontWeight: 500,
            color: v.timerColor,
          }}
        >
          {v.remainingLong}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 12.5, color: COLORS.SUBTLE }}>集合時間</span>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 500 }}>
          {v.meetAtLabel}
        </span>
      </div>

      {v.isHost && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 500, margin: "2px 0 6px" }}>
            集合時間を変更(年月日・時刻)
          </div>
          {/* width は指定せずコンテンツ幅にする(iOS Safari ではボタン状に描画されるため。
              作成モーダル側 CreateRoomModal と揃える)。 */}
          <input
            type="datetime-local"
            value={v.setMeetAtVal}
            onChange={v.onSetMeetAt}
            style={{
              width: "90%",
              height: 40,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: 6,
              background: COLORS.WHITE,
              fontFamily: "inherit",
              fontSize: 13,
              color: COLORS.INK,
              padding: "0 10px",
              boxSizing: "border-box",
              marginBottom: 6,
            }}
          />
          <div style={{ fontSize: 11, color: COLORS.GRAY, marginBottom: 16 }}>
            集合の3時間後({v.curEndAt})に自動終了します。
          </div>
        </>
      )}

      <button
        onClick={v.tapLeave}
        className="hv-bg-err"
        style={{
          width: "100%",
          height: 44,
          borderRadius: 9999,
          border: "1px solid #f7d4d6",
          background: COLORS.WHITE,
          color: COLORS.ERR,
          fontWeight: 500,
          fontSize: 14,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        ルームを退出
      </button>
    </div>
  );
}
