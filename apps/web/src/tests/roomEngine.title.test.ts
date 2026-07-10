// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";
import { api, saveHostToken } from "@/lib/api";

// ルーム名変更のサーバー反映(設定シート)。従来はローカル state 更新のみで
// サーバーへ送っておらず、公開一覧や再参加に反映されなかった不具合の回帰テスト。
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("ルーム名の変更(設定シート)", () => {
  it("入力が止まるとデバウンス後にサーバーへ PATCH される", async () => {
    vi.useFakeTimers();
    const e = new RoomEngine();
    e.setState({ roomId: "room1", visibility: "public", isHost: true });
    saveHostToken("room1", "tok", Date.now() + 3600000);
    const spy = vi.spyOn(api, "patchVisibility").mockResolvedValue({ visibility: "public" });

    e.onTitleInput("サッカー");
    e.onTitleInput("サッカー部 集合");
    expect(spy).not.toHaveBeenCalled(); // 入力中は送らない

    await vi.advanceTimersByTimeAsync(900);
    expect(spy).toHaveBeenCalledTimes(1); // デバウンスされ最後の値だけ送る
    expect(spy).toHaveBeenCalledWith("room1", "tok", "public", "サッカー部 集合");
    expect(e.state.roomTitle).toBe("サッカー部 集合");
  });

  it("host token が無い(host でない)場合は送らない", async () => {
    vi.useFakeTimers();
    const e = new RoomEngine();
    e.setState({ roomId: "room1", visibility: "public" });
    const spy = vi.spyOn(api, "patchVisibility").mockResolvedValue({ visibility: "public" });

    e.onTitleInput("勝手に変更");
    await vi.advanceTimersByTimeAsync(900);
    expect(spy).not.toHaveBeenCalled();
  });

  it("URL で開き直すとサーバーのルーム名が復元される", async () => {
    const e = new RoomEngine();
    vi.spyOn(api, "getRoom").mockResolvedValue({
      status: "active",
      expires_at: new Date(Date.now() + 3 * 3600000).toISOString(),
      visibility: "public",
      title: "変更後の名前",
    });
    await e.openRoomById("room1"); // 共有URL経由は title 引数なし
    expect(e.state.roomTitle).toBe("変更後の名前");
  });

  it("送信に失敗したらトーストで知らせる(次回の入力で再送できる)", async () => {
    vi.useFakeTimers();
    const e = new RoomEngine();
    e.setState({ roomId: "room1", visibility: "public", isHost: true });
    saveHostToken("room1", "tok", Date.now() + 3600000);
    vi.spyOn(api, "patchVisibility").mockRejectedValue(new Error("network"));

    e.onTitleInput("新しい名前");
    await vi.advanceTimersByTimeAsync(900);
    expect(e.state.toasts.some((t) => t.msg === "ルーム名を変更できませんでした")).toBe(true);
  });
});
