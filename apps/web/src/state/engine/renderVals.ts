// 派生値計算(プロトタイプと同名の renderVals)。RoomEngine の state から
// 画面描画用の値・ハンドラ束を毎回計算する(issue #74 で RoomEngine.ts から切り出し)。
// 状態は持たない:読み取りは engine.state、書き込みは engine の公開メソッド経由。

import type { ChangeEvent, MouseEvent } from "react";
import type { AreaId, Building, Member, Room } from "@/types/campus";
import { AREAS, AREA_ORDER, MAP_AREAS } from "@/lib/mapAreas";
import { BUILDINGS, CLAMP, MAP_TEXTS, bById, roomFull } from "@/lib/campusData";
import { serverConfig } from "@/lib/constants";
import { fmtLong, fmtMeetLabel, fmtShort, fromLocalInput, toLocalInput } from "@/lib/format";
import { getHostToken } from "@/lib/api";
import { clampToEdge, metersBetween, project, unproject } from "@/lib/coords";
import type { RoomEngine } from "../RoomEngine";

// 現在見えている表示領域をワールド座標の矩形で返す(範囲外ピンを画面端に出すため。issue #3)。
function viewportRect(engine: RoomEngine): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  const A = AREAS[engine.state.area];
  const vp = engine.vpRef.current;
  if (!vp) return { xmin: 26, ymin: 26, xmax: A.w - 26, ymax: A.h - 26 };
  const r = vp.getBoundingClientRect();
  const { tx, ty, k } = engine.state.view;
  const m = 34 / k; // 画面端からのマージン(px 換算)
  return {
    xmin: -tx / k + m,
    ymin: -ty / k + m,
    xmax: (r.width - tx) / k - m,
    ymax: (r.height - ty) / k - m,
  };
}

function clampedPos(
  engine: RoomEngine,
  m: Member,
  idxMap: Record<string, number>,
  vr: { xmin: number; ymin: number; xmax: number; ymax: number }
) {
  const cur = engine.state.area;
  const A = AREAS[cur];
  if (m.lost || m.area !== cur) {
    // 実 GPS があれば「その人がいる実方向」で表示領域の端に寄せる(現在地=self を基点。issue #3)。
    if (m.lat != null && m.lng != null) {
      const P = project(MAP_AREAS[cur], m.lat, m.lng);
      const self = engine.state.members.find((x) => x.id === engine.state.selfId);
      const sp =
        self && self.area === cur && self.lat != null && self.lng != null
          ? project(MAP_AREAS[cur], self.lat, self.lng)
          : { x: (vr.xmin + vr.xmax) / 2, y: (vr.ymin + vr.ymax) / 2 };
      // 基点は表示領域内にクランプ(必ず内側から方向を出す)。
      const rx = Math.min(Math.max(sp.x, vr.xmin), vr.xmax);
      const ry = Math.min(Math.max(sp.y, vr.ymin), vr.ymax);
      const e = clampToEdge(rx, ry, P.x, P.y, vr.xmin, vr.ymin, vr.xmax, vr.ymax);
      return { x: e.x, y: e.y, out: true };
    }
    // 位置不明はフォールバック(従来の固定 CLAMP)。
    if (m.lost) {
      const [x, y] = CLAMP[cur].lost;
      const i = idxMap.lost++;
      return { x: x + i * 44, y, out: true };
    }
    const c = CLAMP[cur][m.area] || [30, A.h / 2];
    const i = (idxMap[m.area] = (idxMap[m.area] || 0) + 1);
    return { x: c[0], y: c[1] + (i - 1) * 42, out: true };
  }
  return {
    x: Math.min(Math.max(m.x, 16), A.w - 16),
    y: Math.min(Math.max(m.y, 30), A.h - 10),
    out: false,
  };
}

function locLabel(m: Member): string {
  if (m.viewer) return "閲覧のみ・位置非共有";
  if (m.lost) return "範囲外(全エリア外)";
  const areaN = AREAS[m.area].name;
  if (m.building) return bById(m.building)!.name + " " + m.floor + " ・ " + areaN;
  return areaN;
}

// 目的地(集合場所)までの距離を GPS 実座標(緯度経度)から計算する(issue #28)。
// 位置未共有(lat/lng なし)は「—」。目的地の緯度経度は resolveMeetingPos の x/y を unproject で復元。
function distTo(m: Member, mp: { area: AreaId; x: number; y: number } | null): string {
  // 閲覧のみ/位置未共有は「—」。範囲外(lost)でも GPS があれば実距離を出す(issue #28)。
  if (!mp || m.viewer || m.lat == null || m.lng == null) return "—";
  const dest = unproject(MAP_AREAS[mp.area], mp.x, mp.y);
  return fmtDist(metersBetween({ lat: m.lat, lng: m.lng }, dest));
}

function fmtDist(d: number): string {
  if (d >= 1000) return "約" + (d / 1000).toFixed(d >= 10000 ? 0 : 1) + "km";
  return "約" + Math.max(10, Math.round(d / 10) * 10) + "m";
}

// 空き教室追加パネルの派生値(プロトタイプの IIFE を切り出し)。
function addPlanVals(engine: RoomEngine) {
  const s = engine.state;
  const b = bById(s.addB) || BUILDINGS[0];
  const f = b.floors.find((x) => x.level === s.addF) || b.floors[0];
  const sel = new Set(s.addRs);
  const cell = (r: Room) => ({
    n: r.n,
    t: r.t || "",
    bg: sel.has(r.id) ? "#171717" : "#ffffff",
    fg: sel.has(r.id) ? "#ffffff" : "#171717",
    pick: () =>
      engine.setState((st) => ({
        addRs: st.addRs.includes(r.id) ? st.addRs.filter((x) => x !== r.id) : [...st.addRs, r.id],
      })),
  });
  const half = Math.ceil(f.rooms.length / 2);
  return {
    addFloorTabs: b.floors.map((fl) => ({
      name: fl.level,
      bg: f.level === fl.level ? "#171717" : "#ffffff",
      fg: f.level === fl.level ? "#ffffff" : "#4d4d4d",
      bd: f.level === fl.level ? "#171717" : "#ebebeb",
      pick: () => engine.setState({ addF: fl.level }),
    })),
    addPlanTitle: b.name + " " + f.level,
    addPlanTop: f.rooms.slice(0, half).map(cell),
    addPlanBottom: f.rooms.slice(half).map(cell),
    addPlanHasBottom: f.rooms.length > half,
    addRSel: s.addRs.length > 0,
    addSelCount: s.addRs.length,
    addSelLabel: s.addRs.map((rid) => roomFull(rid)).join(" / "),
    addSubmitLabel: s.addRs.length ? "追加する(" + s.addRs.length + ")" : "追加する",
  };
}

export function renderVals(engine: RoomEngine) {
  const s = engine.state;
  const remaining = s.expiresAt ? Math.max(0, s.expiresAt - s.now) : 0;
  const mp = engine.resolveMeetingPos();
  const A = AREAS[s.area];
  const invScale = Math.min(2.6, Math.max(0.85, 1 / s.view.k)).toFixed(3);

  // pins
  const meetTargetId = s.meeting && s.meeting.kind === "member" ? s.meeting.memberId : null;
  const idxMap: Record<string, number> = { lost: 0 };
  const vr = viewportRect(engine);
  const pinList = [];
  for (const m of s.members) {
    if (m.viewer) continue;
    const pos = clampedPos(engine, m, idxMap, vr);
    const self = m.id === s.selfId;
    const isMeet = m.id === meetTargetId && !pos.out;
    const floorTag = m.building
      ? " ・ " + bById(m.building)!.name.replace("号館", "") + "号館" + m.floor
      : "";
    pinList.push({
      x: pos.x.toFixed(1),
      y: pos.y.toFixed(1),
      label: pos.out
        ? m.name + " ・ 範囲外"
        : isMeet
          ? "集合 ・ " + m.name + (self ? "(自分)" : "")
          : self
            ? m.name + "(自分)"
            : m.name + floorTag,
      chipBg: pos.out ? "#f5f5f5" : isMeet ? "#0070f3" : self ? "#171717" : "#ffffff",
      chipFg: pos.out ? "#888888" : isMeet ? "#ffffff" : self ? "#ffffff" : "#171717",
      chipBd: pos.out ? "#e0e0e0" : isMeet ? "#0070f3" : self ? "#171717" : "#ebebeb",
      dotBg: pos.out ? "#bdbdbd" : isMeet ? "#0070f3" : self ? "#171717" : "#ffffff",
      dotBd: pos.out ? "#f5f5f5" : isMeet ? "#ffffff" : self ? "#ffffff" : "#171717",
      anim: self && !pos.out ? "ims-pulse 2.2s infinite" : "none",
    });
  }

  // meeting pin(member追従型は対象メンバーのピン自体を青くするため描画しない)
  let meetingPinOn = false;
  let meetingPinX = "0";
  let meetingPinY = "0";
  if (mp && !meetTargetId && mp.area === s.area && s.screen === "map") {
    meetingPinOn = true;
    meetingPinX = mp.x.toFixed(1);
    meetingPinY = mp.y.toFixed(1);
  }

  // member rows
  const selfM = s.members.find((m) => m.id === s.selfId);
  const memberRows = s.members.map((m) => ({
    id: m.id,
    initial: (m.name || "?")[0],
    avBg: m.id === s.selfId ? "#171717" : "#ffffff",
    avFg: m.id === s.selfId ? "#ffffff" : "#171717",
    avBd: m.id === s.selfId ? "#171717" : "#a1a1a1",
    name: m.name,
    tag: m.id === s.selfId ? (s.isHost ? "あなた ・ host" : "あなた") : "",
    loc: locLabel(m),
    dist: distTo(m, mp),
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
        engine.setState({ area: m.area }, () => engine.centerOn(m.x, m.y, 1.2));
      else engine.centerOn(m.x, m.y, Math.max(s.view.k, 1.2));
    },
  }));

  // area summary
  const counts: Record<string, number> = {};
  let lostN = 0;
  for (const m of s.members) {
    if (m.viewer) continue;
    if (m.lost) {
      lostN++;
      continue;
    }
    counts[m.area] = (counts[m.area] || 0) + 1;
  }
  const sumParts = Object.keys(counts).map((k) => AREAS[k as AreaId].short + " " + counts[k]);
  if (lostN) sumParts.push("範囲外 " + lostN);
  const viewers = s.members.filter((m) => m.viewer).length;
  if (viewers) sumParts.push("閲覧 " + viewers);

  // buildings(データ定義 → コンポーネント描画)
  const selB = bById(s.selB) || BUILDINGS[0];
  const campusBuildings = BUILDINGS.map((b: Building) => {
    const active = s.sheet === "building" && s.selB === b.id;
    return {
      id: b.id,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      name: b.name,
      cap: b.cap || "",
      fs: b.fs || 19,
      bd: active ? "#171717" : "#a1a1a1",
      bw: active ? 3 : 1.5,
      pick: (e: MouseEvent) => {
        e.stopPropagation();
        engine.setState({ selB: b.id, sheet: "building" });
      },
    };
  });
  const mapTexts = (MAP_TEXTS[s.area] || []).map((t) => ({
    x: t.x,
    y: t.y,
    t: t.t,
    size: t.size,
    c: t.c,
    w: t.w || 400,
    ff: t.mono ? "'Geist Mono',monospace" : "inherit",
    ls: t.mono ? ".05em" : "0",
    tf:
      t.a === "l"
        ? "translate(0,-50%)"
        : t.a === "r"
          ? "translate(-100%,-50%)"
          : "translate(-50%,-50%)",
  }));
  const buildingOpts = BUILDINGS.map((b) => ({ id: b.id, name: b.name }));
  const buildingChips = BUILDINGS.map((b) => ({
    name: b.name,
    bg: s.selB === b.id ? "#171717" : "#ffffff",
    fg: s.selB === b.id ? "#ffffff" : "#171717",
    bd: s.selB === b.id ? "#171717" : "#ebebeb",
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
        bg: s.selRoom === r.id ? "#171717" : "#ffffff",
        fg: s.selRoom === r.id ? "#ffffff" : "#171717",
        bd: s.selRoom === r.id ? "#171717" : "#ebebeb",
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
    bg: s.mtMember === m.id ? "#171717" : "#ffffff",
    fg: s.mtMember === m.id ? "#ffffff" : "#171717",
    bd: s.mtMember === m.id ? "#171717" : "#ebebeb",
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
  const mtApplyDisabled =
    s.mtKind === "member" ? !s.mtMember : s.mtKind === "place" ? !s.placeR : false;

  const suggestions = s.suggestions.map((sg) => ({
    label: roomFull(sg.ref),
    meta: (sg.note ? "「" + sg.note + "」 ・ " : "") + sg.by + "さんが追加",
    adopt: () => engine.adoptSuggestion(sg),
  }));

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

  const meetingLabel = engine.meetingLabelOf(s.meeting);
  const selfDist = selfM ? distTo(selfM, mp) : "—";
  const onMap = s.screen === "map";

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
    creating: s.creating,
    createLabel: s.creating ? "作成中…" : "作成する",
    createRoom: engine.createRoom,
    goPublic: engine.goPublic,
    goTop: engine.goTop,
    openRoomById: engine.openRoomById, // 共有リンク起動時の存在チェック(issue #13 / App.tsx)
    createOpen: s.createOpen,
    cancelCreate: engine.cancelCreate,
    submitCreate: engine.submitCreate,
    newTitle: s.newTitle,
    onNewTitle: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ newTitle: e.target.value }),
    newVisPub: s.newVis === "public",
    newVisDotPriv: s.newVis === "private" ? "#171717" : "transparent",
    newVisDotPub: s.newVis === "public" ? "#171717" : "transparent",
    pickNewPriv: () => engine.setState({ newVis: "private" }),
    pickNewPub: () => engine.setState({ newVis: "public" }),
    newMeetAt: s.newMeetAt,
    onNewMeetAt: (e: ChangeEvent<HTMLInputElement>) =>
      engine.setState({ newMeetAt: e.target.value }),
    newEndAt: fmtMeetLabel(fromLocalInput(s.newMeetAt) + serverConfig.endOffsetMs),
    meetAtLabel: s.meetAt ? fmtMeetLabel(s.meetAt) : "—",
    setMeetAtVal: s.meetAt ? toLocalInput(s.meetAt) : "",
    onSetMeetAt: (e: ChangeEvent<HTMLInputElement>) => engine.setMeetAt(e.target.value),
    curEndAt: s.expiresAt ? fmtMeetLabel(s.expiresAt) : "—",

    // public
    refreshPublic: engine.refreshPublic,
    refreshAnim: s.refreshing ? "ims-spin .8s linear infinite" : "none",
    publicRooms,
    hasPublicRooms: publicRooms.length > 0,
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
    joinB: s.joinB,
    onJoinB: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.setState({ joinB: e.target.value, joinF: "" }),
    joinF: s.joinF,
    onJoinF: (e: ChangeEvent<HTMLSelectElement>) => engine.setState({ joinF: e.target.value }),
    joinFloorOpts: floorsOf(s.joinB),
    buildingOpts,
    joinDisabled: !s.name.trim() || s.name.length > serverConfig.maxNameLength,
    tapJoin: engine.tapJoin,
    joinViewer: engine.joinViewer,
    permModal: s.permModal,
    permAllow: engine.permAllow,
    permDeny: engine.permDeny,

    // timer
    remainingShort: fmtShort(remaining),
    remainingLong: fmtLong(remaining),
    timerColor: remaining < 300000 ? "#ee0000" : "#171717",

    // map
    areasSeg: AREA_ORDER.map((id) => ({
      label: AREAS[id].short,
      bg: s.area === id ? "#171717" : "transparent",
      fg: s.area === id ? "#ffffff" : "#4d4d4d",
      pick: () => engine.pickArea(id),
    })),
    reconnecting: s.reconnecting,
    viewerOnly: s.viewerOnly,
    sharePosAgain: engine.sharePosAgain,
    vpRef: engine.vpRef,
    onMapDown: engine.onMapDown,
    onMapMove: engine.onMapMove,
    onMapUp: engine.onMapUp,
    onMapCancel: engine.onMapCancel,
    onMapWheel: engine.onMapWheel,
    worldW: A.w,
    worldH: A.h,
    mapTransform: "translate(" + s.view.tx + "px," + s.view.ty + "px) scale(" + s.view.k + ")",
    invScale,
    area: s.area,
    isCampusArea: s.area === "campus",
    isSt1: s.area === "station_1",
    isSt2: s.area === "station_2",
    campusBuildings,
    mapTexts,
    pinList,
    meetingPinOn,
    meetingPinX,
    meetingPinY,
    pickMode: s.pickMode,
    cancelPick: engine.cancelPick,
    startPick: engine.startPick,
    pinModal: s.pinModal,
    pinNote: s.pinNote,
    onPinNote: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ pinNote: e.target.value }),
    confirmPin: engine.confirmPin,
    cancelPin: engine.cancelPin,
    meetingSet: !!s.meeting,
    meetingLabel,
    meetingDistSelf: "あなたから " + selfDist,
    clearMeeting: engine.clearMeeting,
    meetingByLabel:
      s.meetingBy + "が設定" + (s.meeting && s.meeting.kind === "member" ? " ・ 移動に追従中" : ""),
    fabZoomIn: engine.fabZoomIn,
    fabZoomOut: engine.fabZoomOut,
    fabSelf: engine.fabSelf,
    fabFit: engine.fabFit,
    memberCount: s.members.length,
    memberMax: serverConfig.maxMembersPerRoom, // 上限は /api/config 由来(issue #43)
    areaSummary: sumParts.join(" ・ "),
    openMembers: engine.openMembers,
    openMeeting: engine.openMeeting,
    openBuilding: engine.openBuilding,
    openPlaces: engine.openPlaces,
    openShare: engine.openShare,
    openSettings: engine.openSettings,
    buildingBtnOpacity: s.area === "campus" ? "1" : "0.35",
    tapLeave: engine.tapLeave,

    // sheets
    sheetOpen: !!s.sheet,
    sheetClosing: s.sheetClosing,
    closeSheet: engine.closeSheet,
    sheetRef: engine.sheetRef,
    hDown: engine.hDown,
    hMove: engine.hMove,
    hUp: engine.hUp,
    hCancel: engine.hCancel,
    shMembers: s.sheet === "members",
    shBuilding: s.sheet === "building",
    shMeeting: s.sheet === "meeting",
    shShare: s.sheet === "share",
    shSettings: s.sheet === "settings",
    visBadge: s.visibility === "public" ? "公開" : "非公開",
    visBadgeColor: s.visibility === "public" ? "#ab570a" : "#171717",

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
    mtIsMember: s.mtKind === "member",
    mtIsPlace: s.mtKind === "place",
    mtDotMember: s.mtKind === "member" ? "#171717" : "transparent",
    mtDotPlace: s.mtKind === "place" ? "#171717" : "transparent",
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
    mtApplyDisabled,
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
    ...addPlanVals(engine),
    addNote: s.addNote,
    onAddNote: (e: ChangeEvent<HTMLInputElement>) => engine.setState({ addNote: e.target.value }),
    submitAdd: engine.submitAdd,

    // settings sheet
    shareUrl: engine.shareUrl(),
    copyLink: engine.copyLink,
    webShare: engine.webShare,
    isHost: s.isHost,
    visPublic: s.visibility === "public",
    visDotPriv: s.visibility === "private" ? "#171717" : "transparent",
    visDotPub: s.visibility === "public" ? "#171717" : "transparent",
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

    // toasts(map 画面は下シートを避けて高めに出す)
    toasts: s.toasts,
    toastBottom: onMap ? "140px" : "80px",
  };
}

export type RoomVals = ReturnType<typeof renderVals>;
