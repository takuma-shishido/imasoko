import { useRoom } from "@/state/RoomContext";
import { Button } from "./ui/Button";

// 例外・終了状態(design/08):期限切れ / ルーム終了 / Not Found / 満員。
export function TerminalState() {
  const v = useRoom();

  let code = "";
  let title = "";
  let desc = "";
  let showCreate = false;
  if (v.isExpired) {
    code = "410 GONE";
    title = "このルームは終了しました。";
    desc = "有効期限(2時間)を過ぎたため、位置の共有と閲覧はできません。";
    showCreate = true;
  } else if (v.isEnded) {
    code = "ROOM EXPIRED";
    title = "集合は終了しました。";
    desc = "ルームの有効期限が切れました。位置の共有は停止し、再接続は行われません。";
    showCreate = true;
  } else if (v.isNotFound) {
    code = "404 NOT FOUND";
    title = "ルームが見つかりません。";
    desc = "URLが正しいかご確認ください。ルームは作成から2時間で自動的に消滅します。";
  } else if (v.isFull) {
    code = "ROOM FULL";
    title = "満員で参加できません。";
    desc = "このルームは人数の上限に達しています。";
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        textAlign: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 11,
          letterSpacing: ".14em",
          color: "#888888",
        }}
      >
        {code}
      </div>
      <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.4 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#4d4d4d", lineHeight: 1.8 }}>{desc}</div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22, width: "100%" }}
      >
        {showCreate && (
          <Button variant="primary" size="md" onClick={v.createRoom}>
            新しいルームを作る
          </Button>
        )}
        <Button variant="secondary" size="md" onClick={v.goTop}>
          トップへ戻る
        </Button>
      </div>
    </div>
  );
}
