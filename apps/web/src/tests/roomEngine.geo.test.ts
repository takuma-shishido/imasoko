// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import { project } from "@/lib/coords";
import { MAP_AREAS } from "@/lib/mapAreas";
import type { ClientMsg } from "@/types/messages";

const meState = (lat: number | null, lng: number | null) => ({
  type: "room_state" as const,
  self_id: "me",
  members: [
    {
      id: "me",
      name: "自分",
      building_id: null,
      floor: null,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    },
  ],
  meeting_point: null,
  expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
});

// 実位置取得 → 自分ピン反映 + throttle 送信(issue #2)を engine 単体で検証する。
afterEach(() => vi.useRealTimers());

function joinedEngine() {
  const e = new RoomEngine();
  const sent: ClientMsg[] = [];
  e.attachSocket((m) => sent.push(m));
  // room_state で自分を用意(selfId=me、位置なし=閲覧のみ)。
  e.socket.onServerMsg({
    type: "room_state",
    self_id: "me",
    members: [
      {
        id: "me",
        name: "自分",
        building_id: null,
        floor: null,
        lat: null,
        lng: null,
        updated_at: new Date().toISOString(),
      },
    ],
    meeting_point: null,
    expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
  });
  return { e, sent };
}

describe("RoomEngine geolocation (issue #2)", () => {
  it("実測位置で自分ピンを反映し(閲覧のみ→共有)、初回は position を送信する", () => {
    const { e, sent } = joinedEngine();
    expect(e.state.members.find((m) => m.id === "me")!.viewer).toBe(true);
    e.onGeoPosition(35.6303, 139.7858, 8);
    const me = e.state.members.find((m) => m.id === "me")!;
    expect(me.viewer).toBe(false);
    expect(me.area).toBe("campus");
    expect(me.lost).toBe(false);
    expect(sent).toEqual([{ type: "position", lat: 35.6303, lng: 139.7858, accuracy: 8 }]);
  });

  it("2秒以内・5m未満は再送しない(throttle)", () => {
    vi.useFakeTimers();
    const { e, sent } = joinedEngine();
    e.onGeoPosition(35.6303, 139.7858, 8); // 初回送信
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(500);
    e.onGeoPosition(35.63031, 139.78581, 8); // ~1m・0.5s → 送らない
    expect(sent).toHaveLength(1);
  });

  it("2秒経過かつ5m以上移動で再送する", () => {
    vi.useFakeTimers();
    const { e, sent } = joinedEngine();
    e.onGeoPosition(35.6303, 139.7858, 8);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(2100);
    e.onGeoPosition(35.6306, 139.7858, 8); // ~33m・2.1s → 送る
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ type: "position", lat: 35.6306 });
  });

  it("許可拒否は閲覧のみモードにフォールバックする", () => {
    const e = new RoomEngine();
    expect(e.state.viewerOnly).toBe(false);
    e.onGeoDenied(false);
    expect(e.state.viewerOnly).toBe(true);
  });
});

describe("目的地までの距離をGPS実座標で計算 (issue #28)", () => {
  it("自分から約50m北の集合場所は「約50m」と表示する", () => {
    const e = new RoomEngine();
    e.socket.onServerMsg(meState(35.6303, 139.7858));
    const latB = 35.6303 + 50 / 111320; // 約50m 北
    const p = project(MAP_AREAS.campus, latB, 139.7858);
    e.setMeeting({ kind: "coords", area: "campus", x: p.x, y: p.y }, "あなた");
    expect(e.renderVals().meetingDistSelf).toBe("あなたから 約50m");
  });

  it("位置未共有(lat/lng なし)は「—」", () => {
    const e = new RoomEngine();
    e.socket.onServerMsg(meState(null, null));
    e.setMeeting({ kind: "coords", area: "campus", x: 400, y: 320 }, "あなた");
    expect(e.renderVals().meetingDistSelf).toBe("あなたから —");
  });

  it("範囲外(lost)でもGPSがあれば実距離(km)を出す", () => {
    const e = new RoomEngine();
    e.socket.onServerMsg(meState(35.59786, 139.73339)); // 全エリア外(lost)だが GPS あり
    expect(e.state.members[0].lost).toBe(true);
    const p = project(MAP_AREAS.campus, 35.6303, 139.7858); // campus 内の集合場所
    e.setMeeting({ kind: "coords", area: "campus", x: p.x, y: p.y }, "あなた");
    expect(e.renderVals().meetingDistSelf).toMatch(/^あなたから 約[\d.]+km$/);
  });
});
