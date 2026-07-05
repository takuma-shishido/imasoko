// 集合場所(設定・解除・集合先メンバー退出時の固定)・地図タップのピン挿し・
// 空き教室候補のコントローラ。issue #74 で RoomEngine.ts から切り出し(ロジックは移植のまま)。

import type { AreaId, MeetingPoint, Member, PlaceSuggestion } from "@/types/campus";
import { AREAS } from "@/lib/mapAreas";
import { BUILDINGS, bAnchor, bById, bSpot, roomFull, roomLookup } from "@/lib/campusData";
import type { EngineCore } from "./types";

export class MeetingController {
  constructor(private core: EngineCore) {}

  setMeeting = (point: MeetingPoint, by: string) => {
    this.core.setState({ meeting: point, meetingBy: by });
    this.core.sendMeeting(point);
    this.core.toast("集合場所を設定しました:" + this.meetingLabelOf(point));
  };
  clearMeeting = () => {
    this.core.setState({ meeting: null });
    this.core.sendMeeting(null);
    this.core.toast("集合場所を解除しました");
  };
  // 集合先(member 追従)の相手が退出しても集合場所を失わないようにする(issue #37 案B)。
  // 最後の位置が分かる場合は coords に固定し、位置未共有・全エリア外は固定できないため解除する。
  // サーバーの meeting_point が member のまま残ると再参加・途中参加で集合先が消えるため、
  // 残メンバーのうち id 最小のクライアントが代表して固定結果を送信する(重複送信の回避)。
  // note はワイヤ(coords は lat/lng のみ)に乗らないため、代表送信の echo を受けた非代表端末では
  // 汎用ラベル(「◯◯の地点」)に落ちる(pin-drop の note と同じ既存制約。ピン位置・距離は維持される)。
  keepMeetingOnLeave = (left: Member) => {
    const mt = this.core.state.meeting;
    if (!mt || mt.kind !== "member" || mt.memberId !== left.id) return;
    const fixed: MeetingPoint | null =
      left.viewer || left.lost
        ? null
        : {
            kind: "coords",
            area: left.area,
            x: left.x,
            y: left.y,
            note: left.name + "さんが最後にいた場所",
          };
    this.core.setState({ meeting: fixed });
    this.core.toast(
      fixed
        ? "集合場所を" + left.name + "さんが最後にいた場所に固定しました"
        : "集合先の" + left.name + "さんの位置が分からないため、集合場所を解除しました"
    );
    const leaderId = this.core.state.members.map((m) => m.id).sort()[0];
    if (!leaderId || leaderId !== this.core.state.selfId) return;
    this.core.sendMeeting(fixed);
  };
  meetingLabelOf = (pt: MeetingPoint | null): string => {
    if (!pt) return "";
    if (pt.kind === "coords") return pt.note ? pt.note : AREAS[pt.area].short + "の地点";
    if (pt.kind === "member") {
      const m = this.core.state.members.find((x) => x.id === pt.memberId);
      return (m ? m.name : "?") + "さんのところ";
    }
    if (pt.type === "spot") return bById(pt.ref)!.name + "前";
    return roomFull(pt.ref);
  };
  resolveMeetingPos = (): { area: AreaId; x: number; y: number } | null => {
    const pt = this.core.state.meeting;
    if (!pt) return null;
    if (pt.kind === "coords") return { area: pt.area, x: pt.x, y: pt.y };
    if (pt.kind === "member") {
      const m = this.core.state.members.find((x) => x.id === pt.memberId);
      if (!m || m.lost || m.viewer) return null;
      return { area: m.area, x: m.x, y: m.y };
    }
    if (pt.type === "spot") {
      const b = bById(pt.ref)!;
      const p = bSpot(b);
      return { area: "campus", x: p.x, y: p.y };
    }
    const hit = roomLookup(pt.ref);
    if (!hit) return null;
    const p = bAnchor(hit.b);
    return { area: "campus", x: p.x, y: p.y };
  };

  // ── 地図タップのピン挿し(集合場所の座標指定)──
  startPick = () => this.core.setState({ pickMode: true, sheet: null });
  cancelPick = () => this.core.setState({ pickMode: false });
  cancelPin = () => this.core.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  confirmPin = () => {
    const p = this.core.state.pendingPin;
    if (!p) return;
    this.setMeeting(
      { kind: "coords", area: p.area, x: p.x, y: p.y, note: this.core.state.pinNote.trim() },
      "あなた"
    );
    this.core.setState({ pinModal: false, pendingPin: null, pinNote: "" });
  };

  // ── 集合場所シート(メンバー/場所の選択・空き教室候補)──
  mtPickMember = () => this.core.setState({ mtKind: "member" });
  mtPickPlace = () => this.core.setState({ mtKind: "place" });
  mtApply = () => {
    const s = this.core.state;
    if (s.mtKind === "member") {
      if (!s.mtMember) return;
      this.setMeeting({ kind: "member", memberId: s.mtMember }, "あなた");
      this.core.setState({ sheet: null });
      return;
    }
    if (!s.placeR) return;
    if (s.placeR.startsWith("spot:"))
      this.setMeeting({ kind: "place", type: "spot", ref: s.placeR.slice(5) }, "あなた");
    else this.setMeeting({ kind: "place", type: "classroom", ref: s.placeR.slice(5) }, "あなた");
    this.core.setState({ sheet: null });
  };
  adoptSuggestion = (sg: PlaceSuggestion) => {
    this.setMeeting({ kind: "place", type: "classroom", ref: sg.ref }, "あなた");
    this.core.setState({ sheet: null });
  };
  toggleAdd = () =>
    this.core.setState((s) => {
      const b = bById(s.addB) || BUILDINGS[0];
      return { addOpen: !s.addOpen, addF: b.floors[0].level, addRs: [], addNote: "" };
    });
  submitAdd = () => {
    const s = this.core.state;
    if (!s.addRs.length) {
      this.core.toast("教室を選択してください");
      return;
    }
    const existing = new Set(s.suggestions.map((x) => x.ref));
    const fresh = s.addRs.filter((rid) => !existing.has(rid));
    if (!fresh.length) {
      this.core.toast("選択した教室はすべて追加済みです");
      return;
    }
    const note = s.addNote.trim();
    const now = Date.now();
    const added: PlaceSuggestion[] = fresh.map((rid, i) => ({
      id: "sg" + (now + i),
      kind: "room",
      ref: rid,
      note,
      by: "あなた",
    }));
    const dupN = s.addRs.length - fresh.length;
    this.core.setState({
      suggestions: [...s.suggestions, ...added],
      addOpen: false,
      addNote: "",
      addRs: [],
    });
    fresh.forEach((rid) =>
      this.core.send({
        type: "add_place_suggestion",
        place: { type: "classroom", roomId: rid },
        note,
      })
    );
    this.core.toast(
      fresh.length + "件の空き教室を追加しました" + (dupN ? "(" + dupN + "件は追加済み)" : "")
    );
  };
}
