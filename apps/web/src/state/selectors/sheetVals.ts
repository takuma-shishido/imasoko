// renderVals() の sheets(重畳シート)派生値を切り出した pure セレクタ(issue #101)。
// 対象は共通シート枠 + members / building / meeting / settings シート。
// 返すキー集合・各値・キー順は RoomEngine.renderVals の該当セクションと完全一致させる(挙動不変)。
// engine の可変状態(state)を読み、公開 computed(resolveMeetingPos / distTo / locLabel /
// addPlanVals)や bound ハンドラ・setState は engine 経由で参照する。
// シート開閉・ドラッグは engine.sheetCtl(SheetController)、地図の centerOn は
// engine.gesture を直接参照する(純転送層を挟まない。docs/08 W1/W2)。
import type { ChangeEvent, MouseEvent } from "react";
import { BUILDINGS, bById, classroomFreeAt, roomFull } from "@/lib/campusData";
import { selChip, selDot } from "@/lib/chipColors";
import type { RoomEngine } from "@/state/RoomEngine";
import { COLORS } from "@/lib/theme";

export function sheetVals(engine: RoomEngine) {
  const s = engine.state;
  const mp = engine.resolveMeetingPos();

  // member rows
  const memberRows = s.members.map((m) => ({
    id: m.id,
    initial: (m.name || "?")[0],
    avBg: m.id === s.selfId ? COLORS.INK : COLORS.WHITE,
    avFg: m.id === s.selfId ? COLORS.WHITE : COLORS.INK,
    avBd: m.id === s.selfId ? COLORS.INK : COLORS.MUTED,
    name: m.name,
    tag: m.id === s.selfId ? (s.isHost ? "あなた ・ host" : "あなた") : "",
    loc: engine.locLabel(m),
    dist: engine.distTo(m, mp),
    focus: () => {
      if (m.viewer) {
        engine.toast("位置を共有していないメンバーです");
        return;
      }
      engine.setState({ sheet: null });
      if (m.lost) {
        engine.toast(m.name + "さんは範囲外です");
        return;
      }
      if (m.area !== s.area)
        engine.setState({ area: m.area }, () => engine.gesture.centerOn(m.x, m.y, 1.2));
      else engine.gesture.centerOn(m.x, m.y, Math.max(s.view.k, 1.2));
    },
  }));

  // buildings(データ定義 → コンポーネント描画)
  const selB = bById(s.selB) || BUILDINGS[0];
  const buildingChips = BUILDINGS.map((b) => ({
    name: b.name,
    ...selChip(s.selB === b.id),
    pick: () => engine.pickBuilding(b.id),
  }));
  const floorRows = selB.floors.map((f) => {
    const key = selB.id + "-" + f.level;
    const open = !!s.openFloors[key];
    const names = s.members
      .filter((m) => m.building === selB.id && m.floor === f.level)
      .map((m) => m.name)
      .join("・");
    return {
      level: f.level,
      sub: f.rooms.length + "室",
      names,
      arrow: open ? "▲" : "▼",
      open,
      toggle: () => engine.toggleFloor(key),
      here: (e: MouseEvent) => {
        e.stopPropagation();
        engine.setSelfFloor(selB.id, f.level);
      },
      rooms: f.rooms.map((r) => ({
        label: r.n + (r.t ? " " + r.t : ""),
        ...selChip(s.selRoom === r.id),
        pick: () => engine.pickRoom(r.id),
      })),
    };
  });

  // floor opts for selects
  const floorsOf = (bid: string) => {
    const b = bById(bid);
    return b ? b.floors.map((f) => ({ id: f.level, name: f.level })) : [];
  };

  // meeting sheet
  const others = s.members;
  const memberChips = others.map((m) => ({
    name: m.name + (m.id === s.selfId ? "(自分)" : ""),
    ...selChip(s.mtMember === m.id),
    pick: (e: MouseEvent) => {
      e.stopPropagation();
      engine.setState({ mtMember: m.id, mtKind: "member" });
    },
  }));
  const placeB = bById(s.placeB) || BUILDINGS[0];
  const placeOpts = [{ id: "spot:" + placeB.id, name: placeB.name + "前(屋外)" }];
  for (const f of placeB.floors)
    for (const r of f.rooms)
      placeOpts.push({ id: "room:" + r.id, name: f.level + " " + r.n + (r.t ? " " + r.t : "") });
  // 候補の空き状態は「現在」を基本に表示し、集合時刻の判定が現在と異なる場合のみ併記する(issue #142)
  const nowMs = Date.now();
  const suggestions = s.suggestions.map((sg) => {
    const freeNow = classroomFreeAt(sg.ref, nowMs);
    const freeMeet = s.meetAt ? classroomFreeAt(sg.ref, s.meetAt) : freeNow;
    const parts: string[] = [];
    if (freeNow !== null) parts.push(freeNow ? "現在空き" : "現在使用中");
    if (freeMeet !== null && freeMeet !== freeNow)
      parts.push("集合時刻は" + (freeMeet ? "空き" : "使用中"));
    return {
      label: roomFull(sg.ref),
      meta:
        (parts.length ? parts.join(" ・ ") + " ・ " : "") +
        (sg.note ? "「" + sg.note + "」 ・ " : "") +
        sg.by +
        "さんが追加",
      adopt: () => engine.adoptSuggestion(sg),
    };
  });

  return {
    // sheets
    sheetOpen: !!s.sheet,
    sheetClosing: s.sheetClosing,
    closeSheet: engine.sheetCtl.close,
    sheetRef: engine.sheetRef,
    hDown: engine.sheetCtl.hDown,
    hMove: engine.sheetCtl.hMove,
    hUp: engine.sheetCtl.hUp,
    hCancel: engine.sheetCtl.hCancel,
    shMembers: s.sheet === "members",
    shBuilding: s.sheet === "building",
    shMeeting: s.sheet === "meeting",
    shPlaces: s.sheet === "places",
    shShare: s.sheet === "share",
    shSettings: s.sheet === "settings",
    visBadge: s.visibility === "public" ? "公開" : "非公開",
    visBadgeColor: s.visibility === "public" ? COLORS.AMBER : COLORS.INK,

    // members sheet
    memberRows,
    selfB: s.selfB || "",
    onSelfB: (e: ChangeEvent<HTMLSelectElement>) => engine.setSelfFloor(e.target.value, ""),
    selfF: s.selfF || "",
    onSelfF: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.setSelfFloor(s.selfB || "", e.target.value),
    selfFloorOpts: floorsOf(s.selfB || ""),

    // building sheet
    buildingChips,
    spotLabel: selB.name + "前",
    spotMeet: engine.spotMeet,
    floorRows,
    roomSel: !!s.selRoom,
    roomSelLabel: s.selRoom ? roomFull(s.selRoom) : "",
    roomMeet: engine.roomMeet,
    roomSuggest: engine.roomSuggest,

    // meeting sheet
    mtIsCoords: s.mtKind === "coords",
    mtIsMember: s.mtKind === "member",
    mtIsPlace: s.mtKind === "place",
    mtDotCoords: selDot(s.mtKind === "coords"),
    mtDotMember: selDot(s.mtKind === "member"),
    mtDotPlace: selDot(s.mtKind === "place"),
    mtPickCoords: engine.mtPickCoords,
    mtPickMember: engine.mtPickMember,
    mtPickPlace: engine.mtPickPlace,
    memberChips,
    placeB: s.placeB,
    onPlaceB: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.setState({ placeB: e.target.value, placeR: "" }),
    placeR: s.placeR,
    onPlaceR: (e: ChangeEvent<HTMLSelectElement>) => engine.setState({ placeR: e.target.value }),
    placeOpts,
    mtApply: engine.mtApply,
    mtApplyDisabled: !engine.mtCanApply(),
    suggestions,
    noSuggestions: suggestions.length === 0,
    addOpen: s.addOpen,
    addClosed: !s.addOpen,
    toggleAdd: engine.toggleAdd,
    addB: s.addB,
    onAddB: (e: ChangeEvent<HTMLSelectElement>) => {
      const b = bById(e.target.value);
      engine.setState({ addB: e.target.value, addF: b ? b.floors[0].level : "" });
    },
    ...engine.addPlanVals(),
    addNote: s.addNote,
    onAddNote: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ addNote: e.target.value }),
    submitAdd: engine.submitAdd,

    // settings sheet
    shareUrl: engine.shareUrl(),
    copyLink: engine.copyLink,
    webShare: engine.webShare,
    isHost: s.isHost,
    visPublic: s.visibility === "public",
    visDotPriv: s.visibility === "private" ? COLORS.INK : "transparent",
    visDotPub: s.visibility === "public" ? COLORS.INK : "transparent",
    pickPrivate: engine.pickPrivate,
    pickPublic: engine.pickPublic,
    titleVal: s.roomTitle,
    onTitle: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ roomTitle: e.target.value }),
    warnPublic: s.warnPublic,
    confirmPublic: engine.confirmPublic,
    cancelPublic: engine.cancelPublic,
    leaveOpen: s.leaveOpen,
    doLeave: engine.doLeave,
    cancelLeave: engine.cancelLeave,
  };
}
