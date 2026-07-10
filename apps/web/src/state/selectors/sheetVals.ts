// renderVals() の sheets(重畳シート)派生値を切り出した pure セレクタ(issue #101)。
// 対象は共通シート枠 + members / building / meeting / places / share / settings シート。
// 返すキー集合・各値・キー順は RoomEngine.renderVals の該当セクションと完全一致させる(挙動不変)。
// engine の可変状態(state)を読み、公開 computed(resolveMeetingPos)や bound ハンドラ・
// setState / patchSub は engine 経由で参照する。表示整形(locLabel / distTo)は lib/labels、
// 空き教室追加パネルの派生値(addPlanVals)は本ファイルのローカル関数(issue #165)。
// シート開閉・ドラッグは engine.sheetCtl(SheetController)、地図の centerOn は
// engine.gesture を直接参照する(純転送層を挟まない。docs/08 W1/W2)。
import type { ChangeEvent, MouseEvent } from "react";
import type { Room } from "@/types/campus";
import {
  BUILDINGS,
  bById,
  classroomById,
  classroomDataDate,
  classroomDataStale,
  classroomFreeAt,
  classroomNowLabel,
  roomFull,
} from "@/lib/campusData";
import { fmtMeetLabel } from "@/lib/format";
import { distTo, locLabel } from "@/lib/labels";
import { selChip } from "@/lib/chipColors";
import type { RoomEngine } from "@/state/RoomEngine";
import { COLORS } from "@/lib/theme";

// 空き教室追加パネルの派生値(プロトタイプの IIFE を切り出し)。
// RoomEngine.addPlanVals から本ファイルへ移動(表示整形は selector 層に置く。issue #165)。
function addPlanVals(engine: RoomEngine) {
  const s = engine.state;
  const b = bById(s.add.b) || BUILDINGS[0];
  const f = b.floors.find((x) => x.level === s.add.f) || b.floors[0];
  const sel = new Set(s.add.rs);
  // 空き判定は集合時刻時点(未設定なら現在時刻)で行う(issue #142)
  const availAt = s.meetAt || Date.now();
  const cell = (r: Room) => {
    const c = selChip(sel.has(r.id));
    const info = classroomById(r.id);
    return {
      n: r.n,
      t: r.t || "",
      cap: info && info.capacity > 0 ? info.capacity + "人" : "", // 欠損(=0)は非表示
      free: classroomFreeAt(r.id, availAt), // true=空き / false=使用中 / null=情報なし
      bg: c.bg,
      fg: c.fg,
      pick: () =>
        engine.setState((st) => ({
          add: {
            ...st.add,
            rs: st.add.rs.includes(r.id)
              ? st.add.rs.filter((x) => x !== r.id)
              : [...st.add.rs, r.id],
          },
        })),
    };
  };
  const half = Math.ceil(f.rooms.length / 2);
  const dataDate = classroomDataDate();
  return {
    addFloorTabs: b.floors.map((fl) => ({
      name: fl.level,
      ...selChip(f.level === fl.level, COLORS.SUBTLE),
      pick: () => engine.patchSub("add", { f: fl.level }),
    })),
    addPlanTitle: b.name + " " + f.level,
    addPlanTop: f.rooms.slice(0, half).map(cell),
    addPlanBottom: f.rooms.slice(half).map(cell),
    addPlanHasBottom: f.rooms.length > half,
    // 空き情報の凡例(データが無ければ非表示)。別日のデータなら古い旨を注意表示
    addAvailLegend: dataDate
      ? "● 空き ・ × 使用中(" + fmtMeetLabel(availAt) + " 時点)・ 空き情報 " + dataDate
      : "",
    addAvailStale: dataDate ? classroomDataStale(availAt) : false,
    addRSel: s.add.rs.length > 0,
    addSelCount: s.add.rs.length,
    addSelLabel: s.add.rs.map((rid) => roomFull(rid)).join(" / "),
    // 選択中の各教室の「現在」の状態(× 使用中(HH:MMから空き)/ ● 空き(HH:MMまで))
    addSelAvail: s.add.rs.map((rid) => {
      const now = classroomNowLabel(rid, Date.now());
      return {
        free: now ? now.free : null,
        text: roomFull(rid) + ":" + (now ? now.text : "空き情報なし"),
      };
    }),
    addSubmitLabel: s.add.rs.length ? "追加する(" + s.add.rs.length + ")" : "追加する",
  };
}

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
    ...selChip(s.mt.member === m.id),
    pick: (e: MouseEvent) => {
      e.stopPropagation();
      engine.patchSub("mt", { member: m.id, kind: "member" });
    },
  }));
  const placeB = bById(s.mt.placeB) || BUILDINGS[0];
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
    mtKind: s.mt.kind,
    mtPick: engine.mtPick,
    memberChips,
    placeB: s.mt.placeB,
    onPlaceB: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.patchSub("mt", { placeB: e.target.value, placeR: "" }),
    placeR: s.mt.placeR,
    onPlaceR: (e: ChangeEvent<HTMLSelectElement>) =>
      engine.patchSub("mt", { placeR: e.target.value }),
    placeOpts,
    mtApply: engine.mtApply,
    mtApplyDisabled: !engine.mtCanApply(),
    suggestions,
    noSuggestions: suggestions.length === 0,
    addOpen: s.add.open,
    addClosed: !s.add.open,
    toggleAdd: engine.toggleAdd,
    addB: s.add.b,
    onAddB: (e: ChangeEvent<HTMLSelectElement>) => {
      const b = bById(e.target.value);
      engine.patchSub("add", { b: e.target.value, f: b ? b.floors[0].level : "" });
    },
    ...addPlanVals(engine),
    addNote: s.add.note,
    onAddNote: (e: ChangeEvent<HTMLInputElement>) =>
      engine.patchSub("add", { note: e.target.value }),
    submitAdd: engine.submitAdd,

    // settings sheet
    shareUrl: engine.shareUrl(),
    copyLink: engine.copyLink,
    webShare: engine.webShare,
    isHost: s.isHost,
    visPublic: s.visibility === "public",
    pickPrivate: engine.pickPrivate,
    pickPublic: engine.pickPublic,
    titleVal: s.roomTitle,
    onTitle: (e: ChangeEvent<HTMLInputElement>) => engine.onTitleInput(e.target.value),
    warnPublic: s.warnPublic,
    confirmPublic: engine.confirmPublic,
    cancelPublic: engine.cancelPublic,
    leaveOpen: s.leaveOpen,
    doLeave: engine.doLeave,
    cancelLeave: engine.cancelLeave,
  };
}
