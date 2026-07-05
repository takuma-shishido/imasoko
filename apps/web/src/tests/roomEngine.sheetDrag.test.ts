// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent } from "react";
import { RoomEngine } from "@/state/RoomEngine";

// ボトムシートをハンドルのドラッグで閉じる(hDown/hMove/hUp)を engine 単体で検証する(issue #71)。
// 閉じる条件:下方向に 70px 超のドラッグ、または短距離でも素早いフリック(dy>24 かつ >0.5px/ms)。
const down = (clientY: number) =>
  ({
    pointerId: 1,
    clientY,
    currentTarget: { setPointerCapture: () => {} },
  }) as unknown as PointerEvent<HTMLDivElement>;
const move = (clientY: number) => ({ clientY }) as unknown as PointerEvent<HTMLDivElement>;

let e: RoomEngine;
beforeEach(() => {
  e = new RoomEngine();
  // シートを開いた状態にし、transform 反映用の sheetRef を差し替える。
  e.state = { ...e.state, sheet: "members" };
  (e.sheetRef as { current: HTMLDivElement | null }).current = {
    style: {} as CSSStyleDeclaration,
  } as HTMLDivElement;
});
afterEach(() => vi.restoreAllMocks());

// hDown(t0)→ hUp の 2 回だけ Date.now が呼ばれるので、経過 dt を固定できる。
const drag = (fromY: number, toY: number, dtMs: number) => {
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(1000)
    .mockReturnValueOnce(1000 + dtMs);
  e.hDown(down(fromY));
  e.hMove(move(toY));
  e.hUp();
};

describe("ボトムシートのドラッグで閉じる(issue #71)", () => {
  it("70px を超える下ドラッグで閉じる", () => {
    drag(200, 290, 300); // dy=90(ゆっくりでも距離で閉じる)
    expect(e.state.sheet).toBeNull();
  });

  it("短距離でも素早いフリック(dy>24 かつ >0.5px/ms)で閉じる", () => {
    drag(200, 240, 40); // dy=40, 40ms → 1.0px/ms
    expect(e.state.sheet).toBeNull();
  });

  it("ゆっくりした短距離ドラッグでは閉じない(誤操作防止)", () => {
    drag(200, 240, 300); // dy=40, 300ms → 0.13px/ms、かつ 70px 未満
    expect(e.state.sheet).toBe("members");
  });

  it("わずかな移動(タップに近い)では閉じない", () => {
    drag(200, 212, 10); // dy=12(<24)
    expect(e.state.sheet).toBe("members");
  });

  it("ドラッグ量に応じてシートを translateY で追従させ、離すと戻す", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1000 + 300);
    e.hDown(down(100));
    e.hMove(move(150)); // dy=50
    expect((e.sheetRef.current as HTMLDivElement).style.transform).toBe("translateY(50px)");
    e.hUp(); // dy=50<70 かつ 300ms(0.16px/ms)で低速 → 閉じない
    expect((e.sheetRef.current as HTMLDivElement).style.transform).toBe(""); // 離すと元に戻す
    expect(e.state.sheet).toBe("members"); // 開いたまま
  });
});
