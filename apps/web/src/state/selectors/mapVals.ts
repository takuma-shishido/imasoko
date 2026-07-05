// renderVals() の map(地図画面)派生値を切り出した pure セレクタ(issue #100)。
// 返すキー集合・各値は RoomEngine.renderVals の「// map」セクションと完全一致させる(挙動不変)。
// engine の可変状態(state)を読み、公開 computed(viewportRect / clampedPos / distTo /
// resolveMeetingPos / meetingLabelOf)や bound ハンドラは engine 経由で参照する。
import type { MouseEvent } from "react";
import type { AreaId, Building } from "@/types/campus";
import { AREAS, AREA_ORDER } from "@/lib/mapAreas";
import { BUILDINGS, MAP_TEXTS, bById } from "@/lib/campusData";
import { serverConfig } from "@/lib/constants";
import { selChip } from "@/lib/chipColors";
import type { RoomEngine } from "@/state/RoomEngine";

export function mapVals(engine: RoomEngine) {
  const s = engine.state;
  const mp = engine.resolveMeetingPos();
  const A = AREAS[s.area];
  const invScale = Math.min(2.6, Math.max(0.85, 1 / s.view.k)).toFixed(3);

  // pins
  const meetTargetId = s.meeting && s.meeting.kind === "member" ? s.meeting.memberId : null;
  const idxMap: Record<string, number> = { lost: 0 };
  const vr = engine.viewportRect();
  const pinList = [];
  for (const m of s.members) {
    if (m.viewer) continue;
    const pos = engine.clampedPos(m, idxMap, vr);
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

  // campus buildings(map SVG 上の建物矩形。データ定義 → コンポーネント描画)
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
        engine.pickMapBuilding(b.id);
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

  const selfM = s.members.find((m) => m.id === s.selfId);
  const selfDist = selfM ? engine.distTo(selfM, mp) : "—";
  const meetingLabel = engine.meetingLabelOf(s.meeting);

  return {
    // map
    areasSeg: AREA_ORDER.map((id) => {
      const c = selChip(s.area === id, "#4d4d4d", "transparent");
      return {
        label: AREAS[id].short,
        bg: c.bg,
        fg: c.fg,
        pick: () => engine.pickArea(id),
      };
    }),
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
    onPinNote: engine.onPinNote,
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
  };
}
