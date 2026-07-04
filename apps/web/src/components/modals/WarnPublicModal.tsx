import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";

// 公開化の警告(docs/05 §3 のプライバシー注意)。
export function WarnPublicModal() {
  const v = useRoom();
  if (!v.warnPublic) return null;
  return (
    <Modal>
      <div style={{ fontSize: 15, fontWeight: 600 }}>ルームを公開しますか?</div>
      <div style={{ fontSize: 12.5, color: "#4d4d4d", marginTop: 8, lineHeight: 1.7 }}>
        公開すると、<strong>全員の現在地がURLを知らない人にも見られる</strong>
        ようになります。集合が終わったら非公開に戻すことをおすすめします。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={v.cancelPublic}
          className="hv-border"
          style={{
            flex: 1,
            height: 38,
            borderRadius: 9999,
            border: "1px solid #ebebeb",
            background: "#fff",
            color: "#171717",
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          やめる
        </button>
        <button
          onClick={v.confirmPublic}
          style={{
            flex: 1,
            height: 38,
            borderRadius: 9999,
            border: 0,
            background: "#171717",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          公開する
        </button>
      </div>
    </Modal>
  );
}
