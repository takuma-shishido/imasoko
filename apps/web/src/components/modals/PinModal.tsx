import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";
import { DialogButton } from "../ui/DialogButton";
import { COLORS } from "@/lib/theme";

// 地図タップ地点を集合場所にするモーダル(任意メモ付き)。
export function PinModal() {
  const v = useRoom();
  if (!v.pinModal) return null;
  return (
    <Modal>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 11,
            height: 11,
            background: COLORS.BLUE,
            transform: "rotate(45deg)",
            flex: "none",
          }}
        />
        <div style={{ fontSize: 15, fontWeight: 600 }}>この地点を集合場所に</div>
      </div>
      <div style={{ fontSize: 12, color: COLORS.SUBTLE, margin: "8px 0 12px", lineHeight: 1.6 }}>
        目印になる説明を付けられます(任意)。全員の地図に表示されます。
      </div>
      <input
        value={v.pinNote}
        onChange={v.onPinNote}
        placeholder="例:正門の時計台の下"
        style={{
          width: "100%",
          height: 40,
          border: `1px solid ${COLORS.BORDER}`,
          borderRadius: 6,
          fontFamily: "inherit",
          fontSize: 13,
          padding: "0 10px",
          color: COLORS.INK,
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <DialogButton variant="secondary" onClick={v.cancelPin}>
          キャンセル
        </DialogButton>
        <DialogButton variant="primary" flex={1.4} onClick={v.confirmPin}>
          ここに集合
        </DialogButton>
      </div>
    </Modal>
  );
}
