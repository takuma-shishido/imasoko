import { useRoom } from "@/state/RoomContext";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Radio } from "../ui/Radio";

// 作成モーダル(プロトタイプ固有):ルーム名・公開範囲・集合時間を指定して作成。
export function CreateRoomModal() {
  const v = useRoom();
  if (!v.createOpen) return null;
  return (
    <Modal cardStyle={{ width: 320 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, letterSpacing: ".14em", color: "#888888" }}>
        NEW ROOM
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, margin: "4px 0 14px" }}>新しいルームを作る</div>

      <Input size="md" label="ルーム名(任意)" placeholder="無名のルーム" value={v.newTitle} onChange={v.onNewTitle} />

      <div style={{ fontSize: 12.5, fontWeight: 500, margin: "14px 0 2px" }}>公開範囲</div>
      <div onClick={v.pickNewPriv} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", cursor: "pointer" }}>
        <Radio dot={v.newVisDotPriv} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            非公開<span style={{ color: "#888888", fontWeight: 400 }}>(既定)</span>
          </div>
          <div style={{ fontSize: 11, color: "#888888" }}>URLを知っている人だけが参加できます</div>
        </div>
      </div>
      <div onClick={v.pickNewPub} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", cursor: "pointer" }}>
        <Radio dot={v.newVisDotPub} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>公開</div>
          <div style={{ fontSize: 11, color: "#888888" }}>公開ルーム一覧に載り、誰でも参加できます</div>
        </div>
      </div>
      {v.newVisPub && (
        <div style={{ background: "#ffefcf", color: "#ab570a", fontSize: 11.5, borderRadius: 6, padding: "8px 10px", marginTop: 6, lineHeight: 1.6 }}>
          全員の現在地が、URLを知らない人にも見られるようになります。
        </div>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 500, margin: "16px 0 6px" }}>集合時間(年月日・時刻)</div>
      <input
        type="datetime-local"
        value={v.newMeetAt}
        onChange={v.onNewMeetAt}
        style={{ width: "100%", height: 40, border: "1px solid #ebebeb", borderRadius: 6, background: "#fff", fontFamily: "inherit", fontSize: 13, color: "#171717", padding: "0 10px", boxSizing: "border-box" }}
      />
      <div style={{ fontSize: 11, color: "#888888", marginTop: 6, lineHeight: 1.6 }}>
        集合の3時間後({v.newEndAt})に自動的に終了します。
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={v.cancelCreate}
          className="hv-border"
          style={{ flex: 1, height: 38, borderRadius: 9999, border: "1px solid #ebebeb", background: "#fff", color: "#171717", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
        >
          キャンセル
        </button>
        <button
          onClick={v.submitCreate}
          style={{ flex: 1.4, height: 38, borderRadius: 9999, border: 0, background: "#171717", color: "#fff", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
        >
          {v.createLabel}
        </button>
      </div>
    </Modal>
  );
}
