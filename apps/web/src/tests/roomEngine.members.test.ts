// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import {
  END_OFFSET,
  MAX_MEMBERS_PER_ROOM,
  MAX_NAME_LENGTH,
  setServerConfig,
} from "@/lib/constants";

// serverConfig はモジュール共有のミュータブル状態。各テスト後にフォールバック既定へ戻す。
afterEach(() =>
  setServerConfig({
    end_offset_seconds: END_OFFSET / 1000,
    max_name_length: MAX_NAME_LENGTH,
    max_members_per_room: MAX_MEMBERS_PER_ROOM,
  })
);

describe("メンバー数の上限表示 (issue #43)", () => {
  it("memberMax は serverConfig(= /api/config)に追従する", () => {
    const e = new RoomEngine();
    expect(e.renderVals().memberMax).toBe(MAX_MEMBERS_PER_ROOM);
    setServerConfig({ end_offset_seconds: 10800, max_name_length: 20, max_members_per_room: 12 });
    expect(e.renderVals().memberMax).toBe(12);
  });

  it("memberCount は members 数(初期は 0)を返す", () => {
    expect(new RoomEngine().renderVals().memberCount).toBe(0);
  });
});
