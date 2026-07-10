import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";
import { DialogButton } from "../ui/DialogButton";
import { COLORS } from "@/lib/theme";

// 退出確認(design/07 / docs/05 §0)。
export function LeaveModal() {
  const v = useRoom();
  if (!v.leaveOpen) return null;
  return (
    <Modal>
      <div style={{ fontSize: 15, fontWeight: 600 }}>ルームを退出しますか?</div>
      <div style={{ fontSize: 12.5, color: COLORS.SUBTLE, marginTop: 8, lineHeight: 1.7 }}>
        あなたのピンは全員の地図から消えます。URLから再参加できます。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <DialogButton variant="secondary" onClick={v.cancelLeave}>
          キャンセル
        </DialogButton>
        <DialogButton variant="danger" onClick={v.doLeave}>
          退出する
        </DialogButton>
      </div>
    </Modal>
  );
}
