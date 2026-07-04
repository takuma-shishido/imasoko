// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import type { MemberState } from "@/types/messages";

// WebSocket 受信メッセージ → 内部状態への反映(issue #1)を engine 単体で検証する。
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

describe("RoomEngine WebSocket handling (issue #1)", () => {
  it("room_state で selfId・members・expiresAt を初期化し、lat/lng を area に投影する", () => {
    const e = new RoomEngine();
    const exp = new Date(Date.now() + 3 * 3600000).toISOString();
    e.onServerMsg({
      type: "room_state",
      self_id: "me",
      members: [
        wire({ id: "me", name: "自分" }),
        wire({ id: "u2", name: "ゆうた", lat: 35.6303, lng: 139.7858 }),
      ],
      meeting_point: null,
      expires_at: exp,
    });
    expect(e.state.selfId).toBe("me");
    expect(e.state.members).toHaveLength(2);
    const u2 = e.state.members.find((m) => m.id === "u2")!;
    expect(u2.area).toBe("campus"); // キャンパス bounds 内に投影される
    expect(u2.viewer).toBe(false);
    expect(u2.lost).toBe(false);
    expect(e.state.members.find((m) => m.id === "me")!.viewer).toBe(true); // 位置なし=閲覧のみ
    expect(e.state.expiresAt).toBe(Date.parse(exp));
  });

  it("全エリア外の位置は lost 扱いになる", () => {
    const e = new RoomEngine();
    e.onServerMsg({ type: "member_joined", member: wire({ id: "x", lat: 0, lng: 0 }) });
    expect(e.state.members.find((m) => m.id === "x")!.lost).toBe(true);
  });

  it("member_joined / member_left で一覧が更新される", () => {
    const e = new RoomEngine();
    e.onServerMsg({ type: "member_joined", member: wire({ id: "a", name: "A" }) });
    expect(e.state.members.map((m) => m.id)).toContain("a");
    e.onServerMsg({ type: "member_left", id: "a" });
    expect(e.state.members.map((m) => m.id)).not.toContain("a");
  });

  it("member_update で該当メンバーの位置が更新される", () => {
    const e = new RoomEngine();
    e.onServerMsg({ type: "member_joined", member: wire({ id: "a", name: "A" }) });
    expect(e.state.members.find((m) => m.id === "a")!.viewer).toBe(true);
    e.onServerMsg({
      type: "member_update",
      member: wire({ id: "a", name: "A", lat: 35.6303, lng: 139.7858 }),
    });
    const a = e.state.members.find((m) => m.id === "a")!;
    expect(a.viewer).toBe(false);
    expect(a.area).toBe("campus");
  });

  it("meeting_point(教室)を内部表現へ反映する", () => {
    const e = new RoomEngine();
    e.onServerMsg({
      type: "meeting_point",
      point: { kind: "place", place: { type: "classroom", roomId: "b1-305" } },
    });
    expect(e.state.meeting).toEqual({ kind: "place", type: "classroom", ref: "b1-305" });
  });

  it("room_expired は map 画面を終了(ended)にする", () => {
    const e = new RoomEngine();
    e.enterRoom(false); // screen → map
    expect(e.state.screen).toBe("map");
    e.onServerMsg({ type: "room_expired" });
    expect(e.state.screen).toBe("ended");
  });

  it("room_full は満員画面(full)にする", () => {
    const e = new RoomEngine();
    e.enterRoom(false);
    e.onServerMsg({ type: "room_full" });
    expect(e.state.screen).toBe("full");
  });

  it("自分が設定した meeting_point の echo は無視し、note と meetingBy を保持する", () => {
    const e = new RoomEngine();
    const sent: unknown[] = [];
    e.attachSocket((m) => sent.push(m));
    e.setMeeting({ kind: "coords", area: "campus", x: 400, y: 320, note: "西門前" }, "あなた");
    expect(sent).toHaveLength(1);
    // サーバーは note を持たない coords を echo するが、自己設定なので無視する
    e.onServerMsg({
      type: "meeting_point",
      point: { kind: "coords", area: "campus", lat: 35.632, lng: 139.794 },
    });
    expect(e.state.meeting).toEqual({
      kind: "coords",
      area: "campus",
      x: 400,
      y: 320,
      note: "西門前",
    });
    expect(e.state.meetingBy).toBe("あなた");
    // 別メンバーの変更は上書きし、meetingBy を「メンバー」にする
    e.onServerMsg({
      type: "meeting_point",
      point: { kind: "place", place: { type: "classroom", roomId: "b1-305" } },
    });
    expect(e.state.meeting).toEqual({ kind: "place", type: "classroom", ref: "b1-305" });
    expect(e.state.meetingBy).toBe("メンバー");
  });
});
