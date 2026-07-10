// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { PointerEvent } from "react";
import { RoomEngine } from "@/state/RoomEngine";

// スマホのピンチズーム(2ポインタ)/ パン(1ポインタ)を engine 単体で検証する(issue #68)。
// ハンドラが参照するのは pointerId / clientX / clientY / target.closest / setPointerCapture のみ。
const ev = (pointerId: number, clientX: number, clientY: number, nopan = false) =>
  ({
    pointerId,
    clientX,
    clientY,
    target: { closest: () => (nopan ? {} : null) },
    currentTarget: { setPointerCapture: () => {} },
  }) as unknown as PointerEvent<HTMLDivElement>;

// vpRef を 400x400・原点(0,0)の固定矩形に差し替える(campus は 800x640 → fit=0.5, 下限=0.35)。
const RECT = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 } as DOMRect;

let e: RoomEngine;
beforeEach(() => {
  e = new RoomEngine();
  (e.vpRef as { current: HTMLDivElement | null }).current = {
    getBoundingClientRect: () => RECT,
  } as unknown as HTMLDivElement;
  // 分かりやすい初期ビュー(等倍・無移動)にそろえる。
  e.state = { ...e.state, area: "campus", view: { tx: 0, ty: 0, k: 1 } };
});

describe("RoomEngine ピンチズーム / パン(issue #68)", () => {
  it("2本指を広げると中点を中心にズームインする(距離比 1.5 → k=1.5)", () => {
    e.gesture.onMapDown(ev(1, 100, 200));
    e.gesture.onMapDown(ev(2, 300, 200)); // 2点間距離 200・中点 (200,200)
    e.gesture.onMapMove(ev(2, 400, 200)); // 距離 300・中点 (250,200) → 比 1.5
    // nk = clamp(1 * 300/200) = 1.5。tx = 250 - (200/1)*1.5 = -50、ty = 200 - (200/1)*1.5 = -100。
    expect(e.state.view.k).toBeCloseTo(1.5, 5);
    expect(e.state.view.tx).toBeCloseTo(-50, 5);
    expect(e.state.view.ty).toBeCloseTo(-100, 5);
  });

  it("2本指を狭めるとズームアウトし、下限 fit*0.7(=0.35)でクランプされる", () => {
    e.gesture.onMapDown(ev(1, 100, 200));
    e.gesture.onMapDown(ev(2, 300, 200)); // 距離 200
    e.gesture.onMapMove(ev(2, 150, 200)); // 距離 50 → 比 0.25。k=0.25 は下限 0.35 未満なのでクランプ
    expect(e.state.view.k).toBeCloseTo(0.35, 5);
  });

  it("上限 3.5 を超えてズームインしない", () => {
    e.state = { ...e.state, view: { tx: 0, ty: 0, k: 3 } };
    e.gesture.onMapDown(ev(1, 100, 200));
    e.gesture.onMapDown(ev(2, 300, 200)); // 距離 200
    e.gesture.onMapMove(ev(2, 700, 200)); // 距離 600 → 比 3。3*3=9 だが上限 3.5 でクランプ
    expect(e.state.view.k).toBeCloseTo(3.5, 5);
  });

  it("1本指はズームせず従来どおりパンする", () => {
    e.gesture.onMapDown(ev(1, 200, 200));
    e.gesture.onMapMove(ev(1, 260, 240)); // dx=60, dy=40(>6 なので moved)
    expect(e.state.view.k).toBe(1); // ズームしない
    expect(e.state.view.tx).toBe(60);
    expect(e.state.view.ty).toBe(40);
  });

  it("ピンチから1本離しても破綻せず、残った指でパンを継続できる", () => {
    e.gesture.onMapDown(ev(1, 100, 200));
    e.gesture.onMapDown(ev(2, 300, 200));
    e.gesture.onMapUp(ev(2, 300, 200)); // 1本に減少 → 残る指(p1)でパンを引き継ぐ
    e.gesture.onMapMove(ev(1, 150, 200)); // dx=50 → tx=50
    expect(e.state.view.tx).toBe(50);
    expect(e.state.view.k).toBe(1); // ズームは発生しない
  });

  it("パン→ピンチ遷移で初回フレームがジャンプしない(格納座標がパン中に最新化される)", () => {
    e.gesture.onMapDown(ev(1, 100, 200));
    e.gesture.onMapMove(ev(1, 150, 200)); // 1本指で 50px パン → tx=50、指1の格納座標も (150,200) に更新
    expect(e.state.view.tx).toBe(50);
    e.gesture.onMapDown(ev(2, 350, 200)); // 2本目 → ピンチ開始。prevDist は (150,200)-(350,200)=200
    e.gesture.onMapMove(ev(2, 450, 200)); // curDist 300 → 比 1.5(格納が陳腐化していれば 250→350 の比になる)
    // nk=1.5。tx = 300 - ((250-50)/1)*1.5 = 0、ty = 200 - (200/1)*1.5 = -100。
    expect(e.state.view.k).toBeCloseTo(1.5, 5);
    expect(e.state.view.tx).toBeCloseTo(0, 5);
    expect(e.state.view.ty).toBeCloseTo(-100, 5);
  });

  it("集合地点タップモード:ピンチは集合地点タップに化けない", () => {
    e.state = { ...e.state, pickMode: true };
    e.gesture.onMapDown(ev(1, 100, 100));
    e.gesture.onMapDown(ev(2, 300, 100)); // ピンチ開始
    e.gesture.onMapUp(ev(2, 300, 100)); // 1本目を離す
    e.gesture.onMapUp(ev(1, 100, 100)); // 残りも離す
    expect(e.state.pinModal).toBe(false); // ピン確定モーダルは出ない
    expect(e.state.pickMode).toBe(true); // モードは維持されたまま
  });

  it("ピンチ後でも、単一タップは集合地点として確定できる(pinched がリセットされる)", () => {
    e.state = { ...e.state, pickMode: true };
    // まずピンチして完全に指を離す
    e.gesture.onMapDown(ev(1, 100, 100));
    e.gesture.onMapDown(ev(2, 300, 100));
    e.gesture.onMapUp(ev(2, 300, 100));
    e.gesture.onMapUp(ev(1, 100, 100));
    // 改めて単一タップ(移動なし)
    e.gesture.onMapDown(ev(3, 200, 200));
    e.gesture.onMapUp(ev(3, 200, 200));
    expect(e.state.pinModal).toBe(true);
    expect(e.state.pickMode).toBe(false);
    // world 座標 = (clientXY - 原点 - tx) / k = (200,200)
    expect(e.state.pendingPin).toEqual({ area: "campus", x: 200, y: 200 });
  });

  it("pointercancel でポインタを解放し、以後の単一タップが正しく動く", () => {
    e.state = { ...e.state, pickMode: true };
    e.gesture.onMapDown(ev(1, 100, 100));
    e.gesture.onMapDown(ev(2, 300, 100));
    e.gesture.onMapCancel(ev(1, 100, 100));
    e.gesture.onMapCancel(ev(2, 300, 100)); // すべて解放
    e.gesture.onMapDown(ev(3, 200, 200));
    e.gesture.onMapUp(ev(3, 200, 200));
    expect(e.state.pinModal).toBe(true);
    expect(e.state.pendingPin).toEqual({ area: "campus", x: 200, y: 200 });
  });
});
