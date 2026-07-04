// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import type { ClientMsg } from "@/types/messages";

// 実位置取得 → 自分ピン反映 + throttle 送信(issue #2)を engine 単体で検証する。
afterEach(() => vi.useRealTimers());

function joinedEngine() {
  const e = new RoomEngine();
  const sent: ClientMsg[] = [];
  e.attachSocket((m) => sent.push(m));
  // room_state で自分を用意(selfId=me、位置なし=閲覧のみ)。
  e.onServerMsg({
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
    e.onGeoPosition(35.632, 139.794, 8);
    const me = e.state.members.find((m) => m.id === "me")!;
    expect(me.viewer).toBe(false);
    expect(me.area).toBe("campus");
    expect(me.lost).toBe(false);
    expect(sent).toEqual([{ type: "position", lat: 35.632, lng: 139.794, accuracy: 8 }]);
  });

  it("2秒以内・5m未満は再送しない(throttle)", () => {
    vi.useFakeTimers();
    const { e, sent } = joinedEngine();
    e.onGeoPosition(35.632, 139.794, 8); // 初回送信
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(500);
    e.onGeoPosition(35.63201, 139.79401, 8); // ~1m・0.5s → 送らない
    expect(sent).toHaveLength(1);
  });

  it("2秒経過かつ5m以上移動で再送する", () => {
    vi.useFakeTimers();
    const { e, sent } = joinedEngine();
    e.onGeoPosition(35.632, 139.794, 8);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(2100);
    e.onGeoPosition(35.6323, 139.794, 8); // ~33m・2.1s → 送る
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ type: "position", lat: 35.6323 });
  });

  it("許可拒否は閲覧のみモードにフォールバックする", () => {
    const e = new RoomEngine();
    expect(e.state.viewerOnly).toBe(false);
    e.onGeoDenied(false);
    expect(e.state.viewerOnly).toBe(true);
  });
});
