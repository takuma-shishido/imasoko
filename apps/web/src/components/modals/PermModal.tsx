import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";
import { COLORS } from "@/lib/theme";

// 位置情報許可ダイアログ(デモ)。許可=位置共有 / 拒否=閲覧のみ(docs/02 §5)。
export function PermModal() {
  const v = useRoom();
  if (!v.permModal) return null;
  return (
    <Modal
      overlayStyle={{ alignItems: "flex-start", padding: 0, paddingTop: 70 }}
      cardStyle={{ padding: 18 }}
    >
      <div
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 9.5,
          letterSpacing: ".12em",
          color: COLORS.GRAY,
          marginBottom: 8,
        }}
      >
        ブラウザの許可ダイアログ
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
        {location.hostname} が位置情報の使用許可を求めています
      </div>
      <div style={{ fontSize: 12, color: COLORS.SUBTLE, marginTop: 6, lineHeight: 1.6 }}>
        許可すると、あなたの現在地がこのルームの参加者に共有されます。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={v.permDeny}
          className="hv-border"
          style={{
            flex: 1,
            height: 38,
            borderRadius: 9999,
            border: `1px solid ${COLORS.BORDER}`,
            background: COLORS.WHITE,
            color: COLORS.INK,
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          拒否
        </button>
        <button
          onClick={v.permAllow}
          style={{
            flex: 1,
            height: 38,
            borderRadius: 9999,
            border: 0,
            background: COLORS.INK,
            color: COLORS.WHITE,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          許可
        </button>
      </div>
    </Modal>
  );
}
