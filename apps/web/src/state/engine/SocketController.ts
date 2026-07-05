// WebSocket 実配線(issue #1)のコントローラ:送信関数の注入/解除と、
// サーバー → クライアントの各メッセージの内部状態への反映(dev-docs §6)。
// issue #74 で RoomEngine.ts から切り出し(ロジックは移植のまま)。

import type { ClientMsg, ServerMsg } from "@/types/messages";
import type { MeetingPoint } from "@/types/campus";
import { meetingFromWire, meetingToWire, memberFromWire, suggestionsFromWire } from "@/lib/wire";
import type { EngineCore } from "./types";
import type { MeetingController } from "./MeetingController";

export class SocketController {
  // WebSocket 送信関数(RoomContext の useRoomSocket から注入。issue #1)。
  private socketSend: ((msg: ClientMsg) => void) | null = null;
  // 自分が送った meeting_point の echo を 1 回だけ無視するフラグ(自己設定の上書き防止)。
  private ignoreMeetingEcho = false;

  constructor(
    private core: EngineCore,
    private meeting: MeetingController
  ) {}

  /** RoomContext(useRoomSocket)から送信関数を注入/解除する。 */
  attachSocket = (send: ((msg: ClientMsg) => void) | null) => {
    this.socketSend = send;
  };
  send = (msg: ClientMsg) => {
    this.socketSend?.(msg);
  };
  /** meeting_point の送信。接続中は自分への echo を 1 回だけ無視する(自己設定の上書き防止)。 */
  sendMeeting = (point: MeetingPoint | null) => {
    if (this.socketSend) this.ignoreMeetingEcho = true; // 接続時のみ echo が返る
    this.send({ type: "meeting_point", point: meetingToWire(point) });
  };
  /** 接続時に送る join(名前・建物・階)。再接続時も useRoomSocket が再送する。 */
  joinMessage = (): ClientMsg => {
    const s = this.core.state;
    return {
      type: "join",
      name: s.name.trim() || "あなた",
      building_id: s.joinB || null,
      floor: s.joinF || null,
    };
  };
  /** socket status を再接続バー表示に反映する。 */
  setSocketStatus = (status: "connecting" | "open" | "reconnecting" | "closed") => {
    const reconnecting = status === "reconnecting";
    if (this.core.state.reconnecting !== reconnecting) this.core.setState({ reconnecting });
  };
  private nameOf = (memberId: string): string =>
    this.core.state.members.find((m) => m.id === memberId)?.name ?? "誰か";

  // サーバー → クライアントの各メッセージを内部状態へ反映する(dev-docs §6)。
  onServerMsg = (msg: ServerMsg) => {
    switch (msg.type) {
      case "room_state":
        this.core.setState({
          selfId: msg.self_id,
          members: msg.members.map(memberFromWire),
          meeting: meetingFromWire(msg.meeting_point),
          expiresAt: Date.parse(msg.expires_at),
        });
        break;
      case "member_joined": {
        const nm = memberFromWire(msg.member);
        this.core.setState((s) => ({
          members: s.members.some((m) => m.id === nm.id)
            ? s.members.map((m) => (m.id === nm.id ? nm : m))
            : [...s.members, nm],
        }));
        if (nm.id !== this.core.state.selfId) this.core.toast(nm.name + "さんが参加しました");
        break;
      }
      case "member_update": {
        const nm = memberFromWire(msg.member);
        this.core.setState((s) => ({ members: s.members.map((m) => (m.id === nm.id ? nm : m)) }));
        break;
      }
      case "member_left": {
        const left = this.core.state.members.find((m) => m.id === msg.id);
        this.core.setState((s) => ({ members: s.members.filter((m) => m.id !== msg.id) }));
        if (left && left.id !== this.core.state.selfId)
          this.core.toast(left.name + "さんが退出しました");
        if (left) this.meeting.keepMeetingOnLeave(left);
        break;
      }
      case "meeting_point":
        // 自分が設定した分は setMeeting で反映済み。その echo は 1 回だけ無視して
        // ローカルの meeting(coords の note など)と meetingBy「あなた」を保持する。
        if (this.ignoreMeetingEcho) {
          this.ignoreMeetingEcho = false;
          break;
        }
        this.core.setState({
          meeting: meetingFromWire(msg.point),
          meetingBy: msg.point ? "メンバー" : "",
        });
        break;
      case "place_suggestions":
        this.core.setState({ suggestions: suggestionsFromWire(msg.items, this.nameOf) });
        break;
      case "room_full":
        // 満員で参加拒否。screen が map を外れ、useRoomSocket が切断・再接続しない。
        this.core.setState({ screen: "full", sheet: null });
        break;
      case "room_expired":
        // 期限切れは終了画面へ。screen が map を外れると useRoomSocket が切断し再接続しない。
        if (this.core.state.screen === "map") this.core.setState({ screen: "ended", sheet: null });
        else if (this.core.state.screen === "join") this.core.setState({ screen: "expired" });
        break;
    }
  };
}
