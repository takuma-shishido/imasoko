// 建物シート(建物・階・教室の選択、自分の場所の設定、教室からの集合/候補追加)の
// コントローラ。issue #74 で RoomEngine.ts から切り出し(ロジックは移植のまま)。

import { bById } from "@/lib/campusData";
import type { EngineCore } from "./types";
import type { MeetingController } from "./MeetingController";

export class BuildingController {
  constructor(
    private core: EngineCore,
    private meeting: MeetingController
  ) {}

  pickBuilding = (id: string) => {
    this.core.setState({ selB: id, selRoom: null });
  };
  toggleFloor = (key: string) => {
    this.core.setState((s) => ({ openFloors: { ...s.openFloors, [key]: !s.openFloors[key] } }));
  };
  setSelfFloor = (b: string, f: string) => {
    this.core.setState((s) => ({
      selfB: b,
      selfF: f,
      members: s.members.map((m) =>
        m.id === s.selfId ? { ...m, building: b || null, floor: f || null } : m
      ),
    }));
    this.core.send({ type: "floor", building_id: b || null, floor: f || null });
    const bn = b ? bById(b)!.name : null;
    this.core.toast(
      bn ? "自分の場所を「" + bn + " " + f + "」にしました" : "自分の場所を屋外にしました"
    );
  };
  pickRoom = (rid: string) => {
    this.core.setState((s) => ({ selRoom: s.selRoom === rid ? null : rid }));
  };
  roomMeet = () => {
    const rid = this.core.state.selRoom;
    if (!rid) return;
    this.meeting.setMeeting({ kind: "place", type: "classroom", ref: rid }, "あなた");
    this.core.setState({ selRoom: null, sheet: null });
  };
  roomSuggest = () => {
    const rid = this.core.state.selRoom;
    if (!rid) return;
    if (this.core.state.suggestions.some((x) => x.ref === rid)) {
      this.core.toast("すでに候補に追加されています");
      return;
    }
    this.core.setState((s) => ({
      suggestions: [
        ...s.suggestions,
        { id: "sg" + Date.now(), kind: "room", ref: rid, note: "", by: "あなた" },
      ],
      selRoom: null,
    }));
    this.core.send({
      type: "add_place_suggestion",
      place: { type: "classroom", roomId: rid },
      note: "",
    });
    this.core.toast("空き教室の候補に追加しました");
  };
  spotMeet = () => {
    this.meeting.setMeeting({ kind: "place", type: "spot", ref: this.core.state.selB }, "あなた");
    this.core.setState({ sheet: null });
  };
}
