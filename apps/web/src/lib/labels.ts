// メンバー・集合場所の表示ラベル生成(issue #165)。
// RoomEngine に残っていた表示整形を「描画派生値は selector / 純粋関数は lib」の方針
// (issue #100〜102)に合わせて切り出した純粋関数群。ロジックは engine 時代から不変。

import type { AreaId, MeetingPoint, Member } from "@/types/campus";
import { AREAS, MAP_AREAS } from "@/lib/mapAreas";
import { bById, roomFull } from "@/lib/campusData";
import { metersBetween, unproject } from "@/lib/coords";

/** メンバーの現在地ラベル(建物・階 + エリア名 / 閲覧のみ / 範囲外)。 */
export function locLabel(m: Member): string {
  if (m.viewer) return "閲覧のみ・位置非共有";
  if (m.lost) return "範囲外(全エリア外)";
  const areaN = AREAS[m.area].name;
  if (m.building) return bById(m.building)!.name + " " + m.floor + " ・ " + areaN;
  return areaN;
}

/** 距離の表示整形(1km 以上は km、それ未満は 10m 単位に丸め)。 */
export function fmtDist(d: number): string {
  if (d >= 1000) return "約" + (d / 1000).toFixed(d >= 10000 ? 0 : 1) + "km";
  return "約" + Math.max(10, Math.round(d / 10) * 10) + "m";
}

// 目的地(集合場所)までの距離を GPS 実座標(緯度経度)から計算する(issue #28)。
// 位置未共有(lat/lng なし)は「—」。目的地の緯度経度は meeting.resolvePos() の x/y を unproject で復元。
export function distTo(m: Member, mp: { area: AreaId; x: number; y: number } | null): string {
  // 閲覧のみ/位置未共有は「—」。範囲外(lost)でも GPS があれば実距離を出す(issue #28)。
  if (!mp || m.viewer || m.lat == null || m.lng == null) return "—";
  const dest = unproject(MAP_AREAS[mp.area], mp.x, mp.y);
  return fmtDist(metersBetween({ lat: m.lat, lng: m.lng }, dest));
}

/** 集合場所のラベル(座標=メモ or エリア名 / メンバー=◯◯さんのところ / 場所=建物・教室名)。 */
export function meetingLabelOf(pt: MeetingPoint | null, members: Member[]): string {
  if (!pt) return "";
  if (pt.kind === "coords") return pt.note ? pt.note : AREAS[pt.area].short + "の地点";
  if (pt.kind === "member") {
    const m = members.find((x) => x.id === pt.memberId);
    return (m ? m.name : "?") + "さんのところ";
  }
  if (pt.type === "spot") return bById(pt.ref)!.name + "前";
  return roomFull(pt.ref);
}
