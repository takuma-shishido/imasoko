// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import { api } from "@/lib/api";
import type { RoomStatusRes } from "@/types/messages";

// 公開範囲(visibility)の退出→再参加をまたいだ復元(issue #35)を engine 単体で検証する。
// openRoomById は再参加の導線(公開一覧クリック / 共有リンク)で、サーバー実値から状態を組み立てる。
afterEach(() => vi.restoreAllMocks());

const statusRes = (visibility: "private" | "public"): RoomStatusRes => ({
  status: "active",
  expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
  visibility,
});

describe("公開範囲の復元(退出→再参加。issue #35)", () => {
  it("public のルームに再参加すると public のまま復元される(private に戻らない)", async () => {
    const e = new RoomEngine();
    expect(e.state.visibility).toBe("private"); // 初期値

    vi.spyOn(api, "getRoom").mockResolvedValue(statusRes("public"));
    await e.openRoomById("room1", "サッカー部 集合");

    expect(e.state.screen).toBe("join");
    expect(e.state.visibility).toBe("public");
    // 表示派生値(設定シートのバッジ/ラジオ)も public を反映する
    const v = e.renderVals();
    expect(v.visPublic).toBe(true);
    expect(v.visBadge).toBe("公開");
  });

  it("private のルームに再参加すると private のまま復元される", async () => {
    const e = new RoomEngine();
    vi.spyOn(api, "getRoom").mockResolvedValue(statusRes("private"));
    await e.openRoomById("room2");

    expect(e.state.visibility).toBe("private");
    expect(e.renderVals().visBadge).toBe("非公開");
  });
});
