// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomEngine } from "@/state/RoomEngine";

// ボトムシートの閉じるアニメーション(退場フェーズ)の状態遷移を engine 単体で検証する(issue #71)。
// closeSheet は closing フラグを立て、SHEET_EXIT_MS(200ms)後に実アンマウントする。
describe("ボトムシートの閉じるアニメーション(issue #71)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const withSheet = () => {
    const e = new RoomEngine();
    e.state = { ...e.state, sheet: "members" };
    (e.sheetRef as { current: HTMLDivElement | null }).current = {
      style: {} as CSSStyleDeclaration,
    } as HTMLDivElement;
    return e;
  };

  it("closeSheet は退場中フラグを立て、200ms 後に実際に閉じる", () => {
    const e = withSheet();
    e.sheetCtl.close();
    // 直後:マウントしたまま退場アニメーション中
    expect(e.state.sheetClosing).toBe(true);
    expect(e.state.sheet).toBe("members");
    // sheetRef に退場 transition と translateY(100%) が付く(現在位置から連続して閉じる)
    expect(e.sheetRef.current!.style.transition).toContain("transform");
    expect(e.sheetRef.current!.style.transform).toBe("translateY(100%)");
    // アニメーション長の経過で取り外し
    vi.advanceTimersByTime(200);
    expect(e.state.sheetClosing).toBe(false);
    expect(e.state.sheet).toBeNull();
  });

  it("退場中に開き直すと退場をキャンセルして即表示に戻る(inline transform も消える)", () => {
    const e = withSheet();
    e.sheetCtl.close();
    expect(e.state.sheetClosing).toBe(true);
    e.openMembers(); // 開き直す
    expect(e.state.sheetClosing).toBe(false);
    expect(e.state.sheet).toBe("members");
    expect(e.sheetRef.current!.style.transform).toBe("");
    // 保留していた閉じるタイマーはキャンセル済み → 時間が経っても閉じない
    vi.advanceTimersByTime(500);
    expect(e.state.sheet).toBe("members");
  });

  it("既に閉じ中に closeSheet を重ねても二重に走らない", () => {
    const e = withSheet();
    e.sheetCtl.close();
    e.sheetCtl.close(); // no-op(sheetClosing 中)
    vi.advanceTimersByTime(200);
    expect(e.state.sheet).toBeNull();
  });
});
