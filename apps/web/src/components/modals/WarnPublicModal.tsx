import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";
import { DialogButton } from "../ui/DialogButton";
import { COLORS } from "@/lib/theme";

// 公開化の警告(docs/05 §3 のプライバシー注意)。
export function WarnPublicModal() {
  const v = useRoom();
  if (!v.warnPublic) return null;
  return (
    <Modal>
      <div style={{ fontSize: 15, fontWeight: 600 }}>ルームを公開しますか?</div>
      <div style={{ fontSize: 12.5, color: COLORS.SUBTLE, marginTop: 8, lineHeight: 1.7 }}>
        公開すると、<strong>全員の現在地がURLを知らない人にも見られる</strong>
        ようになります。集合が終わったら非公開に戻すことをおすすめします。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <DialogButton variant="secondary" onClick={v.cancelPublic}>
          やめる
        </DialogButton>
        <DialogButton variant="primary" onClick={v.confirmPublic}>
          公開する
        </DialogButton>
      </div>
    </Modal>
  );
}
