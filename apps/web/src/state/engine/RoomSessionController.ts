// ルームのライフサイクル(作成・存在チェック・公開一覧・参加・共有・公開範囲・退出)の
// コントローラ。REST(lib/api)への呼び出しはここに集約する。
// issue #74 で RoomEngine.ts から切り出し(ロジックは移植のまま)。

import type { DemoRoom } from "@/types/campus";
import { serverConfig } from "@/lib/constants";
import { fmtMeetLabel, fromLocalInput, toLocalInput } from "@/lib/format";
import { api, HttpError, getHostToken, saveHostToken, saveName } from "@/lib/api";
import { initialState } from "./types";
import type { EngineCore, Screen, Visibility } from "./types";
import type { MapViewController } from "./MapViewController";
import type { GeoController } from "./GeoController";

export class RoomSessionController {
  constructor(
    private core: EngineCore,
    private map: MapViewController,
    private geo: GeoController
  ) {}

  // ── navigation ──
  goTop = () => {
    this.core.setState({
      ...initialState(),
      publicList: this.core.state.publicList,
      now: Date.now(),
    });
  };
  createRoom = () =>
    this.core.setState({
      createOpen: true,
      newTitle: "",
      newVis: "private",
      newMeetAt: toLocalInput(Date.now()),
    });
  cancelCreate = () => this.core.setState({ createOpen: false });
  submitCreate = async () => {
    if (this.core.state.creating) return;
    this.core.setState({ creating: true });
    const { newTitle, newVis, newMeetAt } = this.core.state;
    const title = newTitle.trim();
    const meetAtMs = fromLocalInput(newMeetAt);
    try {
      const res = await api.createRoom({
        title: title || undefined,
        visibility: newVis,
        meet_at: new Date(meetAtMs).toISOString(),
      });
      saveHostToken(res.room_id, res.host_token); // 再訪時に host を復元するため端末に保存
      this.core.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.core.state.publicList,
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
      if (res.visibility === "public") this.core.toast("公開ルームとして作成しました");
    } catch {
      this.core.setState({ creating: false });
      this.core.toast("ルームを作成できませんでした。通信環境を確認してください");
    }
  };
  setMeetAt = (v: string) => {
    const meetAt = fromLocalInput(v);
    this.core.setState({ meetAt, expiresAt: meetAt + serverConfig.endOffsetMs });
    this.core.toast("集合時間を " + fmtMeetLabel(meetAt) + " に変更しました");
  };
  goPublic = () => {
    this.core.setState({ screen: "public" });
    void this.loadPublicRooms();
  };
  refreshPublic = () => void this.loadPublicRooms({ toast: true });
  // 公開ルーム一覧を実サーバーから取得(issue #13)。
  private async loadPublicRooms(opts?: { toast?: boolean }) {
    this.core.setState({ refreshing: true });
    try {
      const rooms = await api.getPublicRooms();
      this.core.setState({
        refreshing: false,
        publicList: rooms.map((r) => ({
          id: r.room_id,
          title: r.title,
          members: r.members,
          exp: Date.parse(r.expires_at),
        })),
      });
      if (opts?.toast) this.core.toast("一覧を更新しました");
    } catch {
      this.core.setState({ refreshing: false });
      this.core.toast("公開ルームを取得できませんでした");
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
      this.core.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.core.state.publicList,
        screen: "join",
        roomId,
        roomTitle: title,
        isHost: getHostToken(roomId) !== null, // 作成した端末なら host を復元
        visibility: res.visibility, // 公開範囲をサーバー実値から復元(public→退出→再参加で private に戻る不具合。issue #35)
        meetAt: expiresAt - serverConfig.endOffsetMs,
        expiresAt,
      });
    } catch (e) {
      // 404→NotFound / 410→期限切れ。それ以外(通信エラー・5xx 等)は"存在しない"と
      // 誤認させないよう、再試行できるトップへ戻してトーストで知らせる(issue #13 レビュー対応)。
      const status = e instanceof HttpError ? e.status : 0;
      const screen: Screen = status === 410 ? "expired" : status === 404 ? "notfound" : "top";
      this.core.setState({
        ...initialState(),
        now: Date.now(),
        publicList: this.core.state.publicList,
        screen,
        roomId,
      });
      if (screen === "top")
        this.core.toast("接続できませんでした。通信環境を確認して、もう一度お試しください");
    }
  };

  // ── join ──
  tapJoin = () => {
    const n = this.core.state.name.trim();
    if (!n || n.length > serverConfig.maxNameLength) return;
    this.core.setState({ permModal: true });
  };
  enterRoom = (viewerOnly: boolean) => {
    const s = this.core.state;
    const n = s.name.trim();
    if (n) saveName(n); // 参加時に表示名を保存し、次回の初期値にする(issue #22)
    // 位置送信スロットリング・初回測位フラグをリセット(issue #2)。
    this.geo.reset();
    // 参加者は WebSocket 接続後の room_state 受信で初期化する(issue #1)。
    // screen を map にすると RoomContext(useRoomSocket)が接続し、join を送信する。
    this.core.setState(
      {
        permModal: false,
        viewerOnly,
        screen: "map",
        members: [],
        selfId: "",
        area: "campus",
        selfB: s.joinB,
        selfF: s.joinF,
      },
      () => {
        requestAnimationFrame(() => this.map.fitArea());
      }
    );
    this.core.toast(
      s.isHost ? "ルームを作成しました。「共有」からURLを送りましょう" : "参加しました"
    );
    if (viewerOnly) this.core.toast("閲覧のみで参加しています");
  };
  // 参加中(map)の再共有は enterRoom で作り直さず viewerOnly を切り替えるだけ(issue #2)。
  permAllow = () => {
    if (this.core.state.screen === "map")
      this.core.setState({ permModal: false, viewerOnly: false });
    else this.enterRoom(false);
  };
  permDeny = () => {
    if (this.core.state.screen === "map")
      this.core.setState({ permModal: false, viewerOnly: true });
    else this.enterRoom(true);
  };
  joinViewer = () => {
    if (!this.core.state.name.trim()) {
      this.core.toast("表示名を入力してください");
      return;
    }
    this.enterRoom(true);
  };
  sharePosAgain = () => this.core.setState({ permModal: true });

  // ── share / settings ──
  shareUrl = () => {
    // 実オリジンから生成(ハードコードの imasoko.app だと共有/再参加リンクが実環境で機能しない・issue #21)。
    return location.origin + "/r/" + this.core.state.roomId;
  };
  copyLink = () => {
    const url = this.shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => this.core.toast("リンクをコピーしました"),
        () => this.core.toast("コピーできませんでした。URLを長押しで選択してください")
      );
    } else this.core.toast("コピーできませんでした。URLを長押しで選択してください");
  };
  webShare = () => {
    const url = this.shareUrl();
    if (navigator.share)
      navigator
        .share({ title: "いまそこ", text: "集合ルームに参加してください", url })
        .catch(() => {});
    else {
      this.copyLink();
      this.core.toast("この環境では共有シートが使えないためコピーしました");
    }
  };
  pickPrivate = () => {
    if (this.core.state.visibility === "private") return;
    void this.applyVisibility("private", "ルームを非公開にしました");
  };
  pickPublic = () => {
    if (this.core.state.visibility === "public") return;
    this.core.setState({ warnPublic: true });
  };
  confirmPublic = () => {
    this.core.setState({ warnPublic: false });
    void this.applyVisibility("public", "ルームを公開しました。一覧に表示されます");
  };
  cancelPublic = () => this.core.setState({ warnPublic: false });
  // 公開範囲を実サーバーへ反映(x-host-token)。403=権限なし、失敗時は楽観更新を戻す(issue #13)。
  private async applyVisibility(visibility: Visibility, successMsg: string) {
    const token = getHostToken(this.core.state.roomId);
    if (!token) {
      this.core.toast("公開範囲を変更できるのはホストのみです");
      return;
    }
    const prev = this.core.state.visibility;
    this.core.setState({ visibility }); // 楽観更新
    try {
      await api.patchVisibility(
        this.core.state.roomId,
        token,
        visibility,
        this.core.state.roomTitle.trim() || undefined
      );
      this.core.toast(successMsg);
    } catch (e) {
      this.core.setState({ visibility: prev }); // 失敗したら元に戻す
      this.core.toast(
        e instanceof HttpError && e.status === 403
          ? "権限がありません(ホストのみ変更できます)"
          : "公開範囲を変更できませんでした"
      );
    }
  }
  tapLeave = () => this.core.setState({ leaveOpen: true });
  cancelLeave = () => this.core.setState({ leaveOpen: false });
  doLeave = () => {
    this.core.send({ type: "leave" });
    this.core.toast("退出しました");
    this.goTop();
  };
}
