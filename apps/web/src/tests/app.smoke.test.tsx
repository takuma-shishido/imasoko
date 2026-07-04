// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "@/App";

afterEach(cleanup);

// RoomEngine + Context + 画面遷移がランタイムで動くことのスモークテスト。
describe("App smoke", () => {
  it("トップが表示され、作成→参加フォームまで遷移する", async () => {
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

    // 作成 → 参加フォーム(submitCreate は 900ms の擬似遅延)
    fireEvent.click(screen.getByText("作成する"));
    await waitFor(() => expect(screen.getByText("名前を入れて参加する。")).toBeTruthy(), {
      timeout: 2500,
    });
  });

  it("公開ルーム一覧へ遷移できる", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("公開ルームを探す"));
    expect(screen.getByText("公開ルーム")).toBeTruthy();
    // デモの公開ルームカードが並ぶ
    expect(screen.getByText("サッカー部 集合")).toBeTruthy();
  });
});
