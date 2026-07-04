import { useRoom } from "@/state/RoomContext";
import { Input } from "./ui/Input";
import { Radio } from "./ui/Radio";

// 設定シート(design/07)。公開範囲(host のみ)+ 残り/集合時間 + 集合時間変更 + 退出。
export function RoomVisibility() {
  const v = useRoom();
  return (
    <div>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", color: "#888888" }}>
        SETTINGS
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 12px" }}>ルームの設定</div>

      {v.isHost && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", color: "#888888" }}>
              VISIBILITY
            </div>
            <div style={{ fontSize: 10.5, color: "#888888" }}>host のみ</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, margin: "3px 0 6px" }}>公開範囲</div>

          <div onClick={v.pickPrivate} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 4px", cursor: "pointer" }}>
            <Radio dot={v.visDotPriv} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                非公開<span style={{ color: "#888888", fontWeight: 400 }}>(既定)</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#888888" }}>URLを知っている人だけが参加できます</div>
            </div>
          </div>

          <div onClick={v.pickPublic} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 4px", cursor: "pointer" }}>
            <Radio dot={v.visDotPub} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>公開</div>
              <div style={{ fontSize: 11.5, color: "#ab570a" }}>公開ルーム一覧に載り、誰でも参加できます</div>
            </div>
          </div>

          {v.visPublic && (
            <div style={{ margin: "6px 0 0 26px" }}>
              <Input size="md" label="ルーム名(公開一覧に表示)" placeholder="例:サッカー部 集合" value={v.titleVal} onChange={v.onTitle} />
            </div>
          )}
        </>
      )}

      <div style={{ borderTop: "1px solid #ebebeb", margin: "20px -20px 16px" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: "#4d4d4d" }}>残り時間</span>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 500, color: v.timerColor }}>
          {v.remainingLong}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "#4d4d4d" }}>集合時間</span>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 500 }}>{v.meetAtLabel}</span>
      </div>

      {v.isHost && (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 500, margin: "2px 0 6px" }}>集合時間を変更(年月日・時刻)</div>
          <input
            type="datetime-local"
            value={v.setMeetAtVal}
            onChange={v.onSetMeetAt}
            style={{ width: "100%", height: 40, border: "1px solid #ebebeb", borderRadius: 6, background: "#fff", fontFamily: "inherit", fontSize: 13, color: "#171717", padding: "0 10px", boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            集合の3時間後({v.curEndAt})に自動終了します。
          </div>
        </>
      )}

      <button
        onClick={v.tapLeave}
        className="hv-bg-err"
        style={{ width: "100%", height: 44, borderRadius: 9999, border: "1px solid #f7d4d6", background: "#fff", color: "#ee0000", fontWeight: 500, fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}
      >
        ルームを退出
      </button>
    </div>
  );
}
