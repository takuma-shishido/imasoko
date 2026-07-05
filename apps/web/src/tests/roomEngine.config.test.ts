// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeEvent } from "react";
import { RoomEngine } from "@/state/RoomEngine";
import {
  END_OFFSET,
  MAX_MEMBERS_PER_ROOM,
  MAX_NAME_LENGTH,
  serverConfig,
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

const typeName = (e: RoomEngine, value: string) =>
  e.renderVals().onName({ target: { value } } as unknown as ChangeEvent<HTMLInputElement>);

describe("サーバー定数(/api/config)の取り込み (issue #15)", () => {
  it("setServerConfig は秒→ms 変換して serverConfig を差し替える", () => {
    setServerConfig({ end_offset_seconds: 7200, max_name_length: 8, max_members_per_room: 30 });
    expect(serverConfig.endOffsetMs).toBe(7200 * 1000);
    expect(serverConfig.maxNameLength).toBe(8);
    expect(serverConfig.maxMembersPerRoom).toBe(30);
  });

  it("表示名の上限が config 由来に追従する(nameMax / nameError / joinDisabled)", () => {
    const e = new RoomEngine();
    setServerConfig({ end_offset_seconds: 10800, max_name_length: 5, max_members_per_room: 50 });
    typeName(e, "123456"); // 6 文字 > 5
    const v = e.renderVals();
    expect(v.nameMax).toBe(5);
    expect(v.nameError).toBe("5文字以内で入力してください");
    expect(v.joinDisabled).toBe(true);
  });

  it("有効期限(expiresAt)が config の end_offset に追従する", () => {
    const e = new RoomEngine();
    setServerConfig({ end_offset_seconds: 3600, max_name_length: 20, max_members_per_room: 50 });
    e.setMeetAt("2026-07-05T12:00");
    expect(e.state.expiresAt - e.state.meetAt).toBe(3600 * 1000);
  });
});
