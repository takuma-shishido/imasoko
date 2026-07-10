// ルームのライフサイクル REST(作成 / 開く / 公開一覧 / 公開範囲 / ルーム名同期)を
// RoomEngine から切り出したセッション管理(issue #173)。
// MapGestureController / SheetController / RoomSocketHandler / MeetingModel と同じ
// deps 注入(docs/08 W8)。REST 呼び出し・状態遷移・トースト文言は engine 時代から不変。

import type { DemoRoom } from "@/types/campus";
import type { Visibility } from "@/types/messages";
import { api, HttpError, getHostToken, saveHostToken } from "@/lib/api";
import { serverConfig } from "@/lib/constants";
import { fromLocalInput } from "@/lib/format";
import type { State } from "./RoomEngine";
// engine.setState と同じシグネチャ(パッチ or 更新関数)。
type StateSetter = (patch: Partial<State> | ((s: State) => Partial<State>)) => void;

export interface RoomSessionDeps {
  // 現在の engine 状態(create フォーム / roomId / visibility / roomTitle を読む)。
  getState: () => State;
  // engine の setState 経由で状態を更新する。
  setState: StateSetter;
  // トースト表示(作成・取得・公開範囲・リネームの結果通知)。
  toast: (msg: string) => void;
  // ルーム入室前の初期 state(作成・開く時に publicList 以外をリセットするため)。
  initialState: () => State;
}

export class RoomSession {
  private deps: RoomSessionDeps;
  // ルーム名変更のデバウンス送信(設定シート)。syncedTitle はサーバー反映済みの値。
  private titleTimer: ReturnType<typeof setTimeout> | null = null;
  private syncedTitle = "";

  constructor(deps: RoomSessionDeps) {
    this.deps = deps;
  }

  /** デバウンス中のタイマーを破棄する(engine.stop から呼ぶ)。 */
  stop() {
    if (this.titleTimer) clearTimeout(this.titleTimer);
  }

  submitCreate = async () => {
    const s = this.deps.getState();
    if (s.creating) return;
    this.deps.setState({ creating: true });
    const { create } = s;
    const title = create.title.trim();
    const meetAtMs = fromLocalInput(create.meetAt);
    try {
      const res = await api.createRoom({
        title: title || undefined,
        visibility: create.vis,
        meet_at: new Date(meetAtMs).toISOString(),
      });
      // 再訪時に host を復元するため端末に保存(ルームの有効期限を付けて掃除対象にする)
      saveHostToken(res.room_id, res.host_token, Date.parse(res.expires_at));
      this.syncedTitle = title;
      this.deps.setState({
        ...this.deps.initialState(),
        now: Date.now(),
        publicList: this.deps.getState().publicList,
        creating: false,
        createOpen: false,
        screen: "join",
        roomId: res.room_id,
        isHost: true,
        roomTitle: title,
        visibility: res.visibility,
        meetAt: Date.parse(res.meet_at),
        expiresAt: Date.parse(res.expires_at),
      });
      if (res.visibility === "public") this.deps.toast("公開ルームとして作成しました");
    } catch {
      this.deps.setState({ creating: false });
      this.deps.toast("ルームを作成できませんでした。通信環境を確認してください");
    }
  };

  refreshPublic = () => void this.loadPublicRooms({ toast: true });

  // 公開ルーム一覧を実サーバーから取得(issue #13)。
  async loadPublicRooms(opts?: { toast?: boolean }) {
    this.deps.setState({ refreshing: true });
    try {
      const rooms = await api.getPublicRooms();
      this.deps.setState({
        refreshing: false,
        publicList: rooms.map((r) => ({
          id: r.room_id,
          title: r.title,
          members: r.members,
          exp: Date.parse(r.expires_at),
        })),
      });
      if (opts?.toast) this.deps.toast("一覧を更新しました");
    } catch {
      this.deps.setState({ refreshing: false });
      this.deps.toast("公開ルームを取得できませんでした");
    }
  }

  openPublicRoom = (r: DemoRoom) => {
    void this.openRoomById(r.id, r.title);
  };

  // 参加前の存在チェック(共有リンク/公開一覧クリック)。404→NotFound / 410→期限切れ(issue #13)。
  openRoomById = async (roomId: string, title = "") => {
    try {
      const res = await api.getRoom(roomId);
      const expiresAt = Date.parse(res.expires_at);
      // ルーム名はサーバー実値を優先して復元(共有URL/リロード経由では引数 title が空のため)。
      const restoredTitle = res.title || title;
      this.syncedTitle = restoredTitle;
      this.deps.setState({
        ...this.deps.initialState(),
        now: Date.now(),
        publicList: this.deps.getState().publicList,
        screen: "join",
        roomId,
        roomTitle: restoredTitle,
        isHost: getHostToken(roomId) !== null, // 作成した端末なら host を復元
        visibility: res.visibility, // 公開範囲をサーバー実値から復元(public→退出→再参加で private に戻る不具合。issue #35)
        meetAt: expiresAt - serverConfig.endOffsetMs,
        expiresAt,
      });
    } catch (e) {
      // 404→NotFound / 410→期限切れ。それ以外(通信エラー・5xx 等)は"存在しない"と
      // 誤認させないよう、再試行できるトップへ戻してトーストで知らせる(issue #13 レビュー対応)。
      const status = e instanceof HttpError ? e.status : 0;
      const screen: State["screen"] =
        status === 410 ? "expired" : status === 404 ? "notfound" : "top";
      this.deps.setState({
        ...this.deps.initialState(),
        now: Date.now(),
        publicList: this.deps.getState().publicList,
        screen,
        roomId,
      });
      if (screen === "top")
        this.deps.toast("接続できませんでした。通信環境を確認して、もう一度お試しください");
    }
  };

  // ── 公開範囲(設定シート)──
  pickPrivate = () => {
    if (this.deps.getState().visibility === "private") return;
    void this.applyVisibility("private", "ルームを非公開にしました");
  };
  pickPublic = () => {
    if (this.deps.getState().visibility === "public") return;
    this.deps.setState({ warnPublic: true });
  };
  confirmPublic = () => {
    this.deps.setState({ warnPublic: false });
    void this.applyVisibility("public", "ルームを公開しました。一覧に表示されます");
  };
  cancelPublic = () => this.deps.setState({ warnPublic: false });

  // 公開範囲を実サーバーへ反映(x-host-token)。403=権限なし、失敗時は楽観更新を戻す(issue #13)。
  private async applyVisibility(visibility: Visibility, successMsg: string) {
    const s = this.deps.getState();
    const token = getHostToken(s.roomId);
    if (!token) {
      this.deps.toast("公開範囲を変更できるのはホストのみです");
      return;
    }
    const prev = s.visibility;
    this.deps.setState({ visibility }); // 楽観更新
    const titleSent = this.deps.getState().roomTitle.trim() || undefined;
    try {
      await api.patchRoom(s.roomId, token, { visibility, title: titleSent });
      if (titleSent !== undefined) this.syncedTitle = titleSent;
      this.deps.toast(successMsg);
    } catch (e) {
      this.deps.setState({ visibility: prev }); // 失敗したら元に戻す
      this.deps.toast(
        e instanceof HttpError && e.status === 403
          ? "権限がありません(ホストのみ変更できます)"
          : "公開範囲を変更できませんでした"
      );
    }
  }

  // ── ルーム名(設定シート)──
  // ローカル反映しつつ、入力が止まったらサーバーへ送る。
  // 従来はローカル state を更新するだけでサーバーへ送っておらず、公開一覧や再参加に反映されなかった。
  onTitleInput = (title: string) => {
    this.deps.setState({ roomTitle: title });
    if (this.titleTimer) clearTimeout(this.titleTimer);
    this.titleTimer = setTimeout(() => void this.commitTitle(), 800);
  };

  // ルーム名をサーバーへ反映(PATCH /api/rooms/{id} の部分更新で title のみ送る)。host のみ。
  private async commitTitle() {
    const title = this.deps.getState().roomTitle.trim();
    if (title === this.syncedTitle) return;
    const token = getHostToken(this.deps.getState().roomId);
    if (!token) return;
    try {
      await api.patchRoom(this.deps.getState().roomId, token, { title });
      this.syncedTitle = title;
      this.deps.toast("ルーム名を変更しました");
    } catch {
      this.deps.toast("ルーム名を変更できませんでした");
    }
  }
}
