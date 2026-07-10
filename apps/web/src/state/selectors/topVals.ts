// renderVals() の top(トップ/作成)・public(公開ルーム一覧)・join(参加フォーム)・
// timer(残り時間)派生値と、画面遷移フラグ(screens)を切り出した pure セレクタ(issue #102)。
// 返すキー集合・各値・キー順は RoomEngine.renderVals の該当セクションと完全一致させる(挙動不変)。
// engine の可変状態(state)を読み、bound ハンドラ・setState は engine 経由で参照する。
// buildingOpts / floorsOf は join セレクト用。sheets 側(selectors/sheetVals)は同一値の floorsOf を
// 独自保持しており、役割(join vs members/building シート)が別のため各所保持とする(issue #102 報告)。
import type { ChangeEvent } from "react";
import { BUILDINGS, bById } from "@/lib/campusData";
import { serverConfig } from "@/lib/constants";
import { fmtLong, fmtMeetLabel, fmtShort, fromLocalInput, toLocalInput } from "@/lib/format";
import { getHostToken } from "@/lib/api";
import type { RoomEngine } from "@/state/RoomEngine";
import { COLORS } from "@/lib/theme";

export function topVals(engine: RoomEngine) {
  const s = engine.state;
  const remaining = s.expiresAt ? Math.max(0, s.expiresAt - s.now) : 0;

  // buildings(データ定義 → コンポーネント描画。join セレクトで参照)
  const buildingOpts = BUILDINGS.map((b) => ({ id: b.id, name: b.name }));

  // floor opts for selects(join セレクトで参照。sheets 側は selectors/sheetVals が保持)
  const floorsOf = (bid: string) => {
    const b = bById(bid);
    return b ? b.floors.map((f) => ({ id: f.level, name: f.level })) : [];
  };

  // public rooms(実サーバー /api/rooms/public 由来。自分のルームは host_token 保有で判定)
  // 自分のルームでもタップで再参加できる(host は openRoomById で復元。issue #21)。
  const publicRooms = s.publicList
    .filter((r) => r.exp > s.now)
    .map((r) => {
      const own = getHostToken(r.id) !== null;
      return {
        title: (r.title || "無名のルーム") + (own ? "(あなたのルーム)" : ""),
        members: r.members,
        remaining: fmtShort(r.exp - s.now),
        open: () => engine.openPublicRoom(r),
      };
    });

  return {
    // screens
    isTop: s.screen === "top",
    isPublic: s.screen === "public",
    isJoin: s.screen === "join",
    isMap: s.screen === "map",
    isExpired: s.screen === "expired",
    isEnded: s.screen === "ended",
    isNotFound: s.screen === "notfound",
    isFull: s.screen === "full",
    screen: s.screen,
    roomId: s.roomId,

    // top / create
    createLabel: s.creating ? "作成中…" : "作成する",
    createRoom: engine.createRoom,
    goPublic: engine.goPublic,
    goTop: engine.goTop,
    openRoomById: engine.openRoomById, // 共有リンク起動時の存在チェック(issue #13 / App.tsx)
    createOpen: s.createOpen,
    cancelCreate: engine.cancelCreate,
    submitCreate: engine.submitCreate,
    newTitle: s.create.title,
    onNewTitle: (e: ChangeEvent<HTMLInputElement>) =>
      engine.patchSub("create", { title: e.target.value }),
    newVisPub: s.create.vis === "public",
    pickNewPriv: () => engine.patchSub("create", { vis: "private" }),
    pickNewPub: () => engine.patchSub("create", { vis: "public" }),
    newMeetAt: s.create.meetAt,
    onNewMeetAt: (e: ChangeEvent<HTMLInputElement>) =>
      engine.patchSub("create", { meetAt: e.target.value }),
    newEndAt: fmtMeetLabel(fromLocalInput(s.create.meetAt) + serverConfig.endOffsetMs),
    meetAtLabel: s.meetAt ? fmtMeetLabel(s.meetAt) : "—",
    setMeetAtVal: s.meetAt ? toLocalInput(s.meetAt) : "",
    onSetMeetAt: (e: ChangeEvent<HTMLInputElement>) => engine.setMeetAt(e.target.value),
    curEndAt: s.expiresAt ? fmtMeetLabel(s.expiresAt) : "—",

    // public
    refreshPublic: engine.refreshPublic,
    refreshAnim: s.refreshing ? "ims-spin .8s linear infinite" : "none",
    publicRooms,
    noPublicRooms: publicRooms.length === 0,

    // join
    roomTitleDisplay: (s.roomTitle || "無名のルーム") + " ・ " + s.roomId,
    name: s.name,
    nameMax: serverConfig.maxNameLength,
    onName: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ name: e.target.value }),
    nameError:
      s.name.length > serverConfig.maxNameLength
        ? `${serverConfig.maxNameLength}文字以内で入力してください`
        : "",
    joinB: s.join.b,
    onJoinB: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.patchSub("join", { b: e.target.value, f: "" }),
    joinF: s.join.f,
    onJoinF: (e: ChangeEvent<HTMLSelectElement>) => engine.patchSub("join", { f: e.target.value }),
    joinFloorOpts: floorsOf(s.join.b),
    buildingOpts,
    joinDisabled: !engine.canJoin(),
    tapJoin: engine.tapJoin,
    joinViewer: engine.joinViewer,
    permModal: s.permModal,
    permAllow: engine.permAllow,
    permDeny: engine.permDeny,

    // timer
    remainingShort: fmtShort(remaining),
    remainingLong: fmtLong(remaining),
    timerColor: remaining < 300000 ? COLORS.ERR : COLORS.INK,
  };
}
