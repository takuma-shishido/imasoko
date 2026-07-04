import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";

// 接続失敗(継続)= design/08。再接続の規定回数失敗後の表示。
export function ConnFailModal() {
  const v = useRoom();
  if (!v.connFail) return null;
  return (
    <Modal overlayStyle={{ background: "rgba(23,23,23,.55)" }} cardStyle={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: ".12em", color: "#888888" }}>
        CONNECTION LOST
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>接続できません</div>
      <div style={{ fontSize: 12.5, color: "#4d4d4d", marginTop: 6, lineHeight: 1.7 }}>
        サーバーへの再接続に失敗しました。電波の良い場所で再試行してください。
      </div>
      <button
        onClick={v.retryConn}
        style={{ width: "100%", height: 40, marginTop: 16, borderRadius: 9999, border: 0, background: "#171717", color: "#fff", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
      >
        再試行
      </button>
    </Modal>
  );
}
