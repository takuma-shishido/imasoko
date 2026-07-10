import { useRoom } from "@/state/RoomContext";
import { JoinForm } from "@/components/JoinForm";
import { MapScreen } from "@/components/MapScreen";
import { TerminalState } from "@/components/TerminalState";

// ルーム画面(/r/:id)。未参加=参加フォーム / 参加後=地図 / 期限切れ・満員などは終了状態(design/00)。
export function RoomPage() {
  const v = useRoom();
  if (v.isJoin) return <JoinForm />;
  if (v.isMap) return <MapScreen />;
  return <TerminalState />;
}
