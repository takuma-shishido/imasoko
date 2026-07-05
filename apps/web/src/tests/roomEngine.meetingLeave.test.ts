// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import type { ClientMsg, MeetingPointMsg, MemberState } from "@/types/messages";

// 集合先(member 追従)の相手が退出しても集合場所が消えないこと(issue #37 案B)を engine 単体で検証する。
const wire = (over: Partial<MemberState> = {}): MemberState => ({
  id: "m1",
  name: "テスト",
  building_id: null,
  floor: null,
  lat: null,
  lng: null,
  updated_at: new Date().toISOString(),
  ...over,
});

const joinRoom = (
  e: RoomEngine,
  selfId: string,
  members: MemberState[],
  meeting: MeetingPointMsg | null = { kind: "member", memberId: "u2" }
) =>
  e.onServerMsg({
    type: "room_state",
    self_id: selfId,
    members,
    meeting_point: meeting,
    expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
  });

describe("集合先メンバー退出時の集合場所保持 (issue #37)", () => {
  it("集合先の人が退出したら最後の位置の coords に固定され、ピン位置・ラベルが維持される", () => {
    const e = new RoomEngine();
    joinRoom(e, "me", [
      wire({ id: "me", name: "自分" }),
      wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
    ]);
    const last = e.state.members.find((m) => m.id === "u2")!;
    expect(e.resolveMeetingPos()).toEqual({ area: last.area, x: last.x, y: last.y });

    e.onServerMsg({ type: "member_left", id: "u2" });

    expect(e.state.meeting).toEqual({
      kind: "coords",
      area: last.area,
      x: last.x,
      y: last.y,
      note: "ゆうたさんが最後にいた場所",
    });
    // 退出後もピン位置(resolveMeetingPos)とラベルが破綻しない
    expect(e.resolveMeetingPos()).toEqual({ area: last.area, x: last.x, y: last.y });
    expect(e.meetingLabelOf(e.state.meeting)).toBe("ゆうたさんが最後にいた場所");
  });

  it("固定後も自分からの距離が計算できる(coords は unproject で実距離を出す)", () => {
    const e = new RoomEngine();
    joinRoom(e, "me", [
      wire({ id: "me", name: "自分", lat: 35.6301, lng: 139.785 }),
      wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
    ]);
    e.onServerMsg({ type: "member_left", id: "u2" });
    expect(e.renderVals().meetingDistSelf).toMatch(/^あなたから 約\d/);
  });

  it("集合先の人が位置未共有(閲覧のみ)なら固定できないため集合場所を解除する", () => {
    const e = new RoomEngine();
    joinRoom(e, "me", [wire({ id: "me", name: "自分" }), wire({ id: "u2", name: "ゆうた" })]);
    e.onServerMsg({ type: "member_left", id: "u2" });
    expect(e.state.meeting).toBeNull();
  });

  it("集合先の人が全エリア外(lost)でも固定せず集合場所を解除する", () => {
    const e = new RoomEngine();
    joinRoom(e, "me", [
      wire({ id: "me", name: "自分" }),
      wire({ id: "u2", name: "ゆうた", lat: 0, lng: 0 }),
    ]);
    e.onServerMsg({ type: "member_left", id: "u2" });
    expect(e.state.meeting).toBeNull();
  });

  it("集合先でないメンバーの退出では集合場所は変わらない", () => {
    const e = new RoomEngine();
    joinRoom(e, "me", [
      wire({ id: "me", name: "自分" }),
      wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
      wire({ id: "u3", name: "はな", lat: 35.6303, lng: 139.7858 }),
    ]);
    e.onServerMsg({ type: "member_left", id: "u3" });
    expect(e.state.meeting).toEqual({ kind: "member", memberId: "u2" });
  });

  it("残メンバー中 id 最小のクライアントだけが固定結果をサーバーへ送信し、その echo は無視する", () => {
    const e = new RoomEngine();
    const sent: ClientMsg[] = [];
    e.attachSocket((m) => sent.push(m));
    joinRoom(e, "me", [
      wire({ id: "me", name: "自分" }),
      wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
      wire({ id: "zz", name: "はな" }),
    ]);
    e.onServerMsg({ type: "member_left", id: "u2" });

    // 残り ["me", "zz"] の最小 = 自分 → 代表送信(coords へ変換済み)
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "meeting_point", point: { kind: "coords" } });

    // サーバーが echo する note なし coords は自己送信分として無視し、note を保持する
    e.onServerMsg({
      type: "meeting_point",
      point: { kind: "coords", area: "campus", lat: 35.6303, lng: 139.7858 },
    });
    expect(e.state.meeting).toMatchObject({ kind: "coords", note: "ゆうたさんが最後にいた場所" });
  });

  it("残メンバー中 id 最小でないクライアントは送信しない(重複送信の回避)", () => {
    const e = new RoomEngine();
    const sent: ClientMsg[] = [];
    e.attachSocket((m) => sent.push(m));
    joinRoom(e, "zz", [
      wire({ id: "zz", name: "自分" }),
      wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
      wire({ id: "aa", name: "はな" }),
    ]);
    e.onServerMsg({ type: "member_left", id: "u2" });
    expect(sent).toHaveLength(0);
    // ローカルでは固定済み(全クライアントが同じ変換をする)
    expect(e.state.meeting).toMatchObject({ kind: "coords" });
  });
});
