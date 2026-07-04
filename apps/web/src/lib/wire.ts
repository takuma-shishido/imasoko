// WS ワイヤ契約(lat/lng・server id)⇔ フロント内部表現(area + x/y・ref)の変換(issue #1 / docs/07 §3)。
// 受信メッセージを RoomEngine の内部表現へ、送信時は逆にワイヤ契約へ変換する。

import type { AreaId, MeetingPoint, Member, PlaceSuggestion } from "@/types/campus";
import type { MeetingPointMsg, MemberState } from "@/types/messages";
import { MAP_AREAS } from "./mapAreas";
import { project, resolveArea, unproject } from "./coords";

/** 緯度経度 → エリア + 画像 px 座標。全エリア外は lost(issue #1/#2)。 */
export function locate(
  lat: number,
  lng: number
): { area: AreaId; x: number; y: number; lost: boolean } {
  const resolved = resolveArea(lat, lng);
  if (resolved == null) return { area: "campus", x: 0, y: 0, lost: true }; // 全エリアの範囲外(圏外)
  const p = project(MAP_AREAS[resolved], lat, lng);
  return { area: resolved, x: p.x, y: p.y, lost: false };
}

/** サーバー MemberState → 内部 Member。lat/lng を area+x/y に変換(位置なし=閲覧のみ、全エリア外=lost)。 */
export function memberFromWire(m: MemberState): Member {
  const hasPos = m.lat != null && m.lng != null;
  const loc = hasPos
    ? locate(m.lat!, m.lng!)
    : { area: "campus" as AreaId, x: 0, y: 0, lost: false };
  return {
    id: m.id,
    name: m.name,
    area: loc.area,
    x: loc.x,
    y: loc.y,
    building: m.building_id,
    floor: m.floor,
    viewer: !hasPos, // 位置未共有は閲覧のみ扱い(実位置取得は #2 で有効化)
    lost: loc.lost,
  };
}

/** サーバー MeetingPointMsg → 内部 MeetingPoint。coords は lat/lng を area+x/y に変換。 */
export function meetingFromWire(pt: MeetingPointMsg | null): MeetingPoint | null {
  if (!pt) return null;
  if (pt.kind === "coords") {
    const p = project(MAP_AREAS[pt.area], pt.lat, pt.lng);
    return { kind: "coords", area: pt.area, x: p.x, y: p.y };
  }
  if (pt.kind === "member") return { kind: "member", memberId: pt.memberId };
  if (pt.place.type === "classroom") {
    return { kind: "place", type: "classroom", ref: pt.place.roomId };
  }
  return { kind: "place", type: "spot", ref: pt.place.spotId };
}

/** 内部 MeetingPoint → サーバー MeetingPointMsg。coords は x/y を lat/lng に逆変換。 */
export function meetingToWire(pt: MeetingPoint | null): MeetingPointMsg | null {
  if (!pt) return null;
  if (pt.kind === "coords") {
    const { lat, lng } = unproject(MAP_AREAS[pt.area], pt.x, pt.y);
    return { kind: "coords", area: pt.area, lat, lng };
  }
  if (pt.kind === "member") return { kind: "member", memberId: pt.memberId };
  if (pt.type === "classroom") {
    return { kind: "place", place: { type: "classroom", roomId: pt.ref } };
  }
  return { kind: "place", place: { type: "building_spot", spotId: pt.ref } };
}

/** サーバー place_suggestions items → 内部 PlaceSuggestion[](空き教室のみ。by は member 名へ解決)。 */
export function suggestionsFromWire(
  items: unknown[],
  nameOf: (memberId: string) => string
): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = [];
  for (const raw of items) {
    const it = raw as {
      id?: string;
      place?: { type?: string; roomId?: string };
      note?: string;
      addedBy?: string;
    };
    if (!it.place || it.place.type !== "classroom" || !it.place.roomId) continue;
    out.push({
      id: it.id ?? "sg" + out.length,
      kind: "room",
      ref: it.place.roomId,
      note: it.note ?? "",
      by: nameOf(it.addedBy ?? ""),
    });
  }
  return out;
}
