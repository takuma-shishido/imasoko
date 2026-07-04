// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChangeEvent } from "react";
import { RoomEngine } from "@/state/RoomEngine";

// 一度入力した表示名を localStorage に保存し、次回の初期値にする(issue #22)。
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

const typeName = (e: RoomEngine, value: string) =>
  e.renderVals().onName({ target: { value } } as unknown as ChangeEvent<HTMLInputElement>);

describe("表示名の使い回し (issue #22)", () => {
  it("参加すると表示名を localStorage に保存する", () => {
    const e = new RoomEngine();
    typeName(e, "たろう");
    e.enterRoom(false);
    expect(localStorage.getItem("imasoko.name")).toBe("たろう");
  });

  it("保存済みの表示名が次回起動時の初期値になる", () => {
    localStorage.setItem("imasoko.name", "はなこ");
    expect(new RoomEngine().state.name).toBe("はなこ");
  });

  it("名前未入力での参加は保存を上書きしない", () => {
    localStorage.setItem("imasoko.name", "はなこ");
    const e = new RoomEngine();
    typeName(e, "   "); // 空白のみ
    e.enterRoom(true);
    expect(localStorage.getItem("imasoko.name")).toBe("はなこ");
  });
});
