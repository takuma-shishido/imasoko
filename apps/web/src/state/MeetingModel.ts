// 集合場所のドメインロジックを RoomEngine から切り出したモデル(issue #173)。
// 設定・解除・退出時の固定(issue #37)・位置解決・集合場所シートの適用を担う。
// MapGestureController / SheetController / RoomSocketHandler と同じ deps 注入(docs/08 W8)。
// 状態遷移・送信・トースト文言は RoomEngine 時代から不変(構造抽出のみ)。

import type { AreaId, MeetingPoint, Member, PlaceSuggestion } from "@/types/campus";
import type { ClientMsg } from "@/types/messages";
import { bAnchor, bById, bSpot, roomLookup } from "@/lib/campusData";
import { meetingLabelOf } from "@/lib/labels";
import { meetingToWire } from "@/lib/wire";
import type { State } from "./RoomEngine";

// engine.setState と同じシグネチャ(パッチ or 更新関数)。
type StateSetter = (patch: Partial<State> | ((s: State) => Partial<State>)) => void;

export interface MeetingDeps {
  // 現在の engine 状態(meeting / members / mt / selfId を読む)。
  getState: () => State;
  // engine の setState 経由で状態を更新する。
  setState: StateSetter;
  // 集合場所フォーム(state.mt)の部分更新(engine.patchSub 経由)。
  patchMt: (p: Partial<State["mt"]>) => void;
  // トースト表示(設定・解除・固定の通知)。
  toast: (msg: string) => void;
  // WS 送信(未接続なら no-op。engine.send 経由)。
  send: (msg: ClientMsg) => void;
  // 自分の送信の echo を1回だけ無視する予約(接続時のみ。engine 側で接続判定して予約する)。
  expectMeetingEcho: () => void;
}

export class MeetingModel {
  private deps: MeetingDeps;

  constructor(deps: MeetingDeps) {
    this.deps = deps;
  }

  set(point: MeetingPoint, by: string) {
    this.deps.setState({ meeting: point, meetingBy: by });
    this.deps.expectMeetingEcho();
    this.deps.send({ type: "meeting_point", point: meetingToWire(point) });
    this.deps.toast(
      "集合場所を設定しました:" + meetingLabelOf(point, this.deps.getState().members)
    );
  }

  clear = () => {
    this.deps.setState({ meeting: null });
    this.deps.expectMeetingEcho();
    this.deps.send({ type: "meeting_point", point: null });
    this.deps.toast("集合場所を解除しました");
  };

  // 集合先(member 追従)の相手が退出しても集合場所を失わないようにする(issue #37 案B)。
  // 最後の位置が分かる場合は coords に固定し、位置未共有・全エリア外は固定できないため解除する。
  // サーバーの meeting_point が member のまま残ると再参加・途中参加で集合先が消えるため、
  // 残メンバーのうち id 最小のクライアントが代表して固定結果を送信する(重複送信の回避)。
  // note はワイヤ(coords は lat/lng のみ)に乗らないため、代表送信の echo を受けた非代表端末では
  // 汎用ラベル(「◯◯の地点」)に落ちる(pin-drop の note と同じ既存制約。ピン位置・距離は維持される)。
  keepOnLeave(left: Member) {
    const s = this.deps.getState();
    const mt = s.meeting;
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
    this.deps.setState({ meeting: fixed });
    this.deps.toast(
      fixed
        ? "集合場所を" + left.name + "さんが最後にいた場所に固定しました"
        : "集合先の" + left.name + "さんの位置が分からないため、集合場所を解除しました"
    );
    const after = this.deps.getState();
    const leaderId = after.members.map((m) => m.id).sort()[0];
    if (!leaderId || leaderId !== after.selfId) return;
    this.deps.expectMeetingEcho();
    this.deps.send({ type: "meeting_point", point: meetingToWire(fixed) });
  }

  /** 集合場所のマップ座標を解決する(member 追従は現在位置、場所は建物のアンカー)。 */
  resolvePos(): { area: AreaId; x: number; y: number } | null {
    const pt = this.deps.getState().meeting;
    if (!pt) return null;
    if (pt.kind === "coords") return { area: pt.area, x: pt.x, y: pt.y };
    if (pt.kind === "member") {
      const m = this.deps.getState().members.find((x) => x.id === pt.memberId);
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
  }

  // ── 集合場所シート(mt フォーム)──
  pickKind = (kind: State["mt"]["kind"]) => this.deps.patchMt({ kind });

  // 「この場所にする」を押せるか。ボタンの無効化(sheetVals)と apply のガードの単一ソース。
  // coords はピン配置(地図で指定)で確定するため常に押せない。
  canApply = () => {
    const s = this.deps.getState();
    return s.mt.kind === "member" ? !!s.mt.member : s.mt.kind === "place" ? !!s.mt.placeR : false;
  };

  apply = () => {
    if (!this.canApply()) return;
    const s = this.deps.getState();
    if (s.mt.kind === "member") this.set({ kind: "member", memberId: s.mt.member! }, "あなた");
    else if (s.mt.placeR.startsWith("spot:"))
      this.set({ kind: "place", type: "spot", ref: s.mt.placeR.slice(5) }, "あなた");
    else this.set({ kind: "place", type: "classroom", ref: s.mt.placeR.slice(5) }, "あなた");
    this.deps.setState({ sheet: null });
  };

  adoptSuggestion(sg: PlaceSuggestion) {
    this.set({ kind: "place", type: "classroom", ref: sg.ref }, "あなた");
    this.deps.setState({ sheet: null });
  }
}
