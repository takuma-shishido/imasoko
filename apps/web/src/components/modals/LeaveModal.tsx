import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";

// 退出確認(design/07 / docs/05 §0)。
export function LeaveModal() {
  const v = useRoom();
  if (!v.leaveOpen) return null;
  return (
    <Modal>
      <div style={{ fontSize: 15, fontWeight: 600 }}>ルームを退出しますか?</div>
      <div style={{ fontSize: 12.5, color: "#4d4d4d", marginTop: 8, lineHeight: 1.7 }}>
        あなたのピンは全員の地図から消えます。URLから再参加できます。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={v.cancelLeave}
          className="hv-border"
          style={{ flex: 1, height: 38, borderRadius: 9999, border: "1px solid #ebebeb", background: "#fff", color: "#171717", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
        >
          キャンセル
        </button>
        <button
          onClick={v.doLeave}
          className="hv-bg-err-deep"
          style={{ flex: 1, height: 38, borderRadius: 9999, border: 0, background: "#ee0000", color: "#fff", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
        >
          退出する
        </button>
      </div>
    </Modal>
  );
}
