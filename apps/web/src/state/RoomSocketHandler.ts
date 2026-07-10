// サーバー → クライアント WS メッセージの受信処理を RoomEngine から切り出したハンドラ(issue #164)。
// MapGestureController / SheetController と同じ deps 注入(docs/08 W8)で、
// engine から state 読み取り / setState / toast / keepMeetingOnLeave を受け取る。
// 状態遷移・副作用(setState 内容 / echo 無視 / マージ規則 / toast)は RoomEngine 時代から不変(構造抽出のみ)。

import type { Member } from "@/types/campus";
import type { ServerMsg } from "@/types/messages";
import { meetingFromWire, memberFromWire, suggestionsFromWire } from "@/lib/wire";
import type { State } from "./RoomEngine";

// engine.setState と同じシグネチャ(パッチ or 更新関数)。
type StateSetter = (patch: Partial<State> | ((s: State) => Partial<State>)) => void;

export interface RoomSocketDeps {
  // 現在の engine 状態(selfId / members / screen を読む)。
  getState: () => State;
  // engine の setState 経由で状態を更新する。
  setState: StateSetter;
  // トースト表示(参加・退出の通知)。
  toast: (msg: string) => void;
  // 退出者が集合先(member 追従)のときの固定/解除(engine の集合場所ドメインロジック)。
  keepMeetingOnLeave: (left: Member) => void;
}

export class RoomSocketHandler {
  private deps: RoomSocketDeps;
  // 自分が送った meeting_point の echo を 1 回だけ無視するフラグ(自己設定の上書き防止)。
  // engine の setMeeting / clearMeeting が送信時に expectMeetingEcho() で予約する。
  private ignoreMeetingEcho = false;

  constructor(deps: RoomSocketDeps) {
    this.deps = deps;
  }

  /** 次に受信する meeting_point を自分の送信の echo として1回だけ無視する。 */
  expectMeetingEcho() {
    this.ignoreMeetingEcho = true;
  }

  private nameOf = (memberId: string): string =>
    this.deps.getState().members.find((m) => m.id === memberId)?.name ?? "誰か";

  // サーバー → クライアントの各メッセージを内部状態へ反映する(dev-docs §6)。
  // 各 case の処理は per-message ハンドラ(onRoomState 等)へ切り出し、ここは振り分けのみ(issue #108)。
  onServerMsg = (msg: ServerMsg) => {
    switch (msg.type) {
      case "room_state":
        this.onRoomState(msg);
        break;
      case "member_joined":
        this.onMemberJoined(msg);
        break;
      case "member_update":
        this.onMemberUpdate(msg);
        break;
      case "member_left":
        this.onMemberLeft(msg);
        break;
      case "meeting_point":
        this.onMeetingPoint(msg);
        break;
      case "place_suggestions":
        this.onPlaceSuggestions(msg);
        break;
      case "room_full":
        this.onRoomFull();
        break;
      case "room_expired":
        this.onRoomExpired();
        break;
    }
  };

  private onRoomState(msg: Extract<ServerMsg, { type: "room_state" }>) {
    this.deps.setState({
      selfId: msg.self_id,
      members: msg.members.map(memberFromWire),
      meeting: meetingFromWire(msg.meeting_point),
      expiresAt: Date.parse(msg.expires_at),
    });
  }

  private onMemberJoined(msg: Extract<ServerMsg, { type: "member_joined" }>) {
    const nm = memberFromWire(msg.member);
    this.deps.setState((s) => ({
      members: s.members.some((m) => m.id === nm.id)
        ? s.members.map((m) => (m.id === nm.id ? nm : m))
        : [...s.members, nm],
    }));
    if (nm.id !== this.deps.getState().selfId) this.deps.toast(nm.name + "さんが参加しました");
  }

  private onMemberUpdate(msg: Extract<ServerMsg, { type: "member_update" }>) {
    const nm = memberFromWire(msg.member);
    this.deps.setState((s) => ({ members: s.members.map((m) => (m.id === nm.id ? nm : m)) }));
  }

  private onMemberLeft(msg: Extract<ServerMsg, { type: "member_left" }>) {
    const left = this.deps.getState().members.find((m) => m.id === msg.id);
    this.deps.setState((s) => ({ members: s.members.filter((m) => m.id !== msg.id) }));
    if (left && left.id !== this.deps.getState().selfId)
      this.deps.toast(left.name + "さんが退出しました");
    if (left) this.deps.keepMeetingOnLeave(left);
  }

  private onMeetingPoint(msg: Extract<ServerMsg, { type: "meeting_point" }>) {
    // 自分が設定した分は setMeeting で反映済み。その echo は 1 回だけ無視して
    // ローカルの meeting(coords の note など)と meetingBy「あなた」を保持する。
    if (this.ignoreMeetingEcho) {
      this.ignoreMeetingEcho = false;
      return;
    }
    this.deps.setState({
      meeting: meetingFromWire(msg.point),
      meetingBy: msg.point ? "メンバー" : "",
    });
  }

  private onPlaceSuggestions(msg: Extract<ServerMsg, { type: "place_suggestions" }>) {
    this.deps.setState({ suggestions: suggestionsFromWire(msg.items, this.nameOf) });
  }

  private onRoomFull() {
    // 満員で参加拒否。screen が map を外れ、useRoomSocket が切断・再接続しない。
    this.deps.setState({ screen: "full", sheet: null });
  }

  private onRoomExpired() {
    // 期限切れは終了画面へ。screen が map を外れると useRoomSocket が切断し再接続しない。
    const screen = this.deps.getState().screen;
    if (screen === "map") this.deps.setState({ screen: "ended", sheet: null });
    else if (screen === "join") this.deps.setState({ screen: "expired" });
  }
}
