import { useRoom } from "@/state/RoomContext";
import { Button } from "./ui/Button";

// 共有シート(design/07)。URL コピー / Web Share + 現在の公開範囲。
export function ShareButton() {
  const v = useRoom();
  return (
    <div>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", color: "#888888" }}>
        SHARE
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 4px" }}>リンクを共有する</div>
      <div style={{ fontSize: 12.5, color: "#888888", marginBottom: 12 }}>
        このURLを送ると、開いた人がそのまま参加できます。
      </div>
      <div style={{ background: "#f5f5f5", border: "1px solid #ebebeb", borderRadius: 8, padding: "11px 12px", marginBottom: 10 }}>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, wordBreak: "break-all", userSelect: "all" }}>
          {v.shareUrl}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" size="md" onClick={v.copyLink} style={{ flex: 1 }}>
          リンクをコピー
        </Button>
        <Button variant="primary" size="md" onClick={v.webShare} style={{ flex: 1 }}>
          共有…
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", borderRadius: 8, padding: "11px 12px", marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "#4d4d4d", flex: 1 }}>現在の公開範囲</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: v.visBadgeColor }}>{v.visBadge}</span>
      </div>
      {v.isHost && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button
            onClick={v.openSettings}
            className="hv-underline"
            style={{ background: "none", border: 0, color: "#0070f3", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", padding: 4 }}
          >
            公開範囲を変更する(設定)→
          </button>
        </div>
      )}
    </div>
  );
}
