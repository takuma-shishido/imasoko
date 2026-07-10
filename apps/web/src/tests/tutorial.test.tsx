// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 実サーバーは起動しないため REST クライアントをモックする(app.smoke と同じ方式)。
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  const in3h = () => new Date(Date.now() + 3 * 3600000).toISOString();
  return {
    ...actual,
    api: {
      createRoom: vi.fn(async () => ({
        room_id: "abc123",
        host_token: "tok",
        meet_at: new Date().toISOString(),
        expires_at: in3h(),
        visibility: "private" as const,
      })),
      getRoom: vi.fn(async () => ({ status: "active" as const, expires_at: in3h() })),
      getPublicRooms: vi.fn(async () => []),
      patchRoom: vi.fn(async () => ({ visibility: "public" as const, title: "" })),
      getCampus: vi.fn(async () => {
        throw new Error("campus not exercised");
      }),
      getConfig: vi.fn(async () => ({
        end_offset_seconds: 3 * 3600,
        max_name_length: 20,
        max_members_per_room: 50,
      })),
    },
  };
});

import { App } from "@/App";
import { TUTORIAL_STEPS } from "@/components/tutorial/steps";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// 実UIの操作(ルーム作成)を検知してステップが進むコーチマーク型チュートリアルのテスト。
describe("Tutorial", () => {
  it("「使い方」で開始し、実際にルームを作ると次のステップへ進む", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    // 開始:step1(ルームを作る)の吹き出しが出る
    fireEvent.click(screen.getByText("? 使い方"));
    expect(screen.getByText(`TUTORIAL 1/${TUTORIAL_STEPS.length}`)).toBeTruthy();
    expect(screen.getByText(TUTORIAL_STEPS[0].speech)).toBeTruthy();

    // 実際にルームを作る(モーダル → 作成 → 参加フォームへ遷移)
    fireEvent.click(screen.getByText("ルームを作る"));
    fireEvent.click(screen.getByText("作成する"));
    await waitFor(() => expect(screen.getByText("名前を入れて参加する。")).toBeTruthy(), {
      timeout: 2500,
    });

    // 画面遷移(実操作)を検知して step2(参加する)へ自動前進
    await waitFor(() =>
      expect(screen.getByText(`TUTORIAL 2/${TUTORIAL_STEPS.length}`)).toBeTruthy()
    );
    expect(screen.getByText(TUTORIAL_STEPS[1].speech)).toBeTruthy();
  });

  it("スキップで閉じる", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("? 使い方"));
    fireEvent.click(screen.getByText("スキップ"));
    expect(screen.queryByText(TUTORIAL_STEPS[0].speech)).toBeNull();
  });

  it("Escape キーで閉じる", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("? 使い方"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(TUTORIAL_STEPS[0].speech)).toBeNull();
  });
});
