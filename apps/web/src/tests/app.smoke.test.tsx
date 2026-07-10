// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 実サーバー(apps/server)は起動しないため REST クライアントをモックする(issue #13)。
// HttpError / host_token ヘルパ(localStorage)は実物をそのまま使う。
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
      getPublicRooms: vi.fn(async () => [
        { room_id: "p1", title: "サッカー部 集合", members: 5, expires_at: in3h() },
      ]),
      patchRoom: vi.fn(async () => ({ visibility: "public" as const, title: "" })),
      // campus はスモークで検証しないため取得失敗にし、フォールバック定義を使わせる。
      getCampus: vi.fn(async () => {
        throw new Error("campus not exercised in smoke");
      }),
      getConfig: vi.fn(async () => ({
        end_offset_seconds: 3 * 3600,
        max_name_length: 20,
        max_members_per_room: 50,
      })),
    },
  };
});

import { api, HttpError } from "@/lib/api";
import { App } from "@/App";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// RoomEngine + Context + 画面遷移 + REST 実配線(issue #13)がランタイムで動くことのスモークテスト。
describe("App smoke", () => {
  it("トップが表示され、作成(api.createRoom)→参加フォームまで遷移する", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    // トップ画面
    expect(screen.getByText("いまそこ")).toBeTruthy();
    expect(screen.getByText("ルームを作る")).toBeTruthy();

    // 作成モーダル
    fireEvent.click(screen.getByText("ルームを作る"));
    expect(screen.getByText("新しいルームを作る")).toBeTruthy();

    // 作成 → 参加フォーム(実 API 応答を待つ)
    fireEvent.click(screen.getByText("作成する"));
    await waitFor(() => expect(screen.getByText("名前を入れて参加する。")).toBeTruthy(), {
      timeout: 2500,
    });
    expect(api.createRoom).toHaveBeenCalledTimes(1);
  });

  it("公開ルーム一覧を実 API(api.getPublicRooms)から取得して表示する", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("公開ルームを探す"));
    expect(screen.getByText("公開ルーム")).toBeTruthy();
    // サーバー応答のルームが並ぶ
    await waitFor(() => expect(screen.getByText("サッカー部 集合")).toBeTruthy());
  });

  it("自分の公開ルームをタップして再参加できる(#21)", async () => {
    localStorage.setItem("imasoko.host.p1", "tok"); // p1 を host(自分のルーム)にする
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("公開ルームを探す"));
    // own なので「(あなたのルーム)」付きで表示され、タップでブロックされず再参加できる
    const card = await screen.findByText("サッカー部 集合(あなたのルーム)");
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByText("名前を入れて参加する。")).toBeTruthy());
    expect(api.getRoom).toHaveBeenCalledWith("p1");
  });

  it("存在しないルームの共有リンク(/r/:id)は 404→NotFound を表示する", async () => {
    vi.mocked(api.getRoom).mockRejectedValueOnce(new HttpError(404, "not found"));
    render(
      <MemoryRouter initialEntries={["/r/nope"]}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("ルームが見つかりません。")).toBeTruthy());
    expect(api.getRoom).toHaveBeenCalledWith("nope");
  });

  it("通信エラー時の共有リンクは 404 ではなくトップへ戻す", async () => {
    vi.mocked(api.getRoom).mockRejectedValueOnce(new Error("network down"));
    render(
      <MemoryRouter initialEntries={["/r/abc"]}>
        <App />
      </MemoryRouter>
    );
    // "見つかりません"(404)ではなくトップ画面に戻る
    await waitFor(() => expect(screen.getByText("いまそこ")).toBeTruthy());
    expect(screen.queryByText("ルームが見つかりません。")).toBeNull();
  });
});
