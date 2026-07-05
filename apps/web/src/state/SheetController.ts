// ボトムシート(重畳シート)の開閉アニメ・ハンドルのドラッグ(down/move/up/cancel)・
// 退場アニメ用の遅延クローズタイマーを RoomEngine から切り出したコントローラ(issue #104)。
// engine から sheetRef 要素 / state 読み取り / setState を注入し、ドラッグの内部状態(sheetDrag)と
// 退場タイマー(sheetCloseTimer)は本クラスが保持する。
// アニメーション時間・しきい値・クランプ・挙動は RoomEngine 時代から一切変えていない(構造抽出のみ)。

import type { PointerEvent } from "react";
import type { State } from "./RoomEngine";

// engine.setState と同じシグネチャ(パッチ or 更新関数 + 任意コールバック)。
type StateSetter = (
  patch: Partial<State> | ((s: State) => Partial<State>),
  cb?: () => void
) => void;

// state.sheet の非 null 値(members / building / meeting / share / settings)。
type SheetName = NonNullable<State["sheet"]>;

// ボトムシート退場アニメーションの長さ(ms)。global.css の ims-sheet-out / ims-fade-out と一致させる(issue #71)。
const SHEET_EXIT_MS = 200;

export interface SheetDeps {
  // シート要素(engine が保持する sheetRef.current)。
  getSheetEl: () => HTMLDivElement | null;
  // 現在の engine 状態(sheet / sheetClosing を読む)。
  getState: () => State;
  // engine の setState 経由で状態を更新する。
  setState: StateSetter;
}

export class SheetController {
  private deps: SheetDeps;

  // t0 はフリック速度算出用(issue #71)。
  private sheetDrag: { sy: number; t0: number; dy?: number } | null = null;
  // ボトムシート退場アニメーション完了後に実際にアンマウントするためのタイマー(issue #71)。
  private sheetCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: SheetDeps) {
    this.deps = deps;
  }

  // 退場アニメーションの pending タイマーを片付ける(engine.stop から呼ぶ。issue #71)。
  stop() {
    if (this.sheetCloseTimer) clearTimeout(this.sheetCloseTimer);
  }

  open(name: SheetName) {
    // 閉じ中に開き直したら退場をキャンセルして即表示する(入場アニメーションで開く)。
    if (this.sheetCloseTimer) {
      clearTimeout(this.sheetCloseTimer);
      this.sheetCloseTimer = null;
    }
    // 退場のために付けた inline の transition/transform を消し、再オープンを綺麗な状態から始める。
    const el = this.deps.getSheetEl();
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    this.deps.setState({ sheet: name, sheetClosing: false });
  }
  // 退場アニメーション付きで閉じる。closing の間もシートをマウントしたまま、
  // 現在の transform(ドラッグ途中の translateY(dy) でもタップ時の 0 でも)から
  // translateY(100%) へ CSS transition で連続的にスライドさせる(途中から閉じても
  // 全開位置へ戻らず滑らかに閉じる。issue #71)。アニメーション長 SHEET_EXIT_MS 経過後に取り外す。
  // 背景タップ・ハンドルのドラッグ/フリック(hUp)いずれの閉じ操作もここを通る。
  close = () => {
    const s = this.deps.getState();
    if (!s.sheet || s.sheetClosing) return;
    const el = this.deps.getSheetEl();
    if (el) {
      el.style.transition = "transform " + SHEET_EXIT_MS + "ms cubic-bezier(.4,0,.6,1)";
      el.style.transform = "translateY(100%)";
    }
    this.deps.setState({ sheetClosing: true });
    if (this.sheetCloseTimer) clearTimeout(this.sheetCloseTimer);
    this.sheetCloseTimer = setTimeout(() => {
      this.sheetCloseTimer = null;
      this.deps.setState({ sheet: null, sheetClosing: false, selRoom: null, addOpen: false });
    }, SHEET_EXIT_MS);
  };
  hDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    // ドラッグ追従は即時にする(前回の退場/戻しで付いた transition を解除)。
    const el = this.deps.getSheetEl();
    if (el) el.style.transition = "";
    this.sheetDrag = { sy: e.clientY, t0: Date.now() };
  };
  hMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!this.sheetDrag) return;
    const dy = Math.max(0, e.clientY - this.sheetDrag.sy);
    this.sheetDrag.dy = dy;
    const el = this.deps.getSheetEl();
    if (el) el.style.transform = "translateY(" + dy + "px)";
  };
  hUp = () => {
    const d = this.sheetDrag;
    this.sheetDrag = null;
    const el = this.deps.getSheetEl();
    if (!d || !d.dy) {
      if (el) el.style.transform = ""; // ほぼ動いていない(タップ相当)→ そのまま
      return;
    }
    // 距離(70px 超)で閉じる。加えて携帯での素早いフリック(短距離でも速い下ドラッグ)でも
    // 閉じられるようにする(しきい値だけだと携帯でハンドルを掴んで軽く下ろしても閉じにくい。issue #71)。
    // velocity は down→up 全体の平均速度(離す瞬間の瞬間速度ではない)。長く保持してから払うと
    // 平均が下がりフリック判定に乗らないが、その場合も距離(70px)経路が拾うため実害は小さい。
    const dt = Math.max(1, Date.now() - d.t0);
    const velocity = d.dy / dt; // px/ms(平均)
    if (d.dy > 70 || (d.dy > 24 && velocity > 0.5)) {
      this.close(); // 現在の translateY(dy) から連続して退場(transform は戻さない)
    } else if (el) {
      // 閾値未満:掴んだ位置から元位置へアニメーションで戻す(スナップバック)。
      el.style.transition = "transform .18s cubic-bezier(.3,.8,.4,1)";
      el.style.transform = "";
    }
  };
  // ハンドルのドラッグがシステム中断された場合の解放(ヒット領域拡大で発火機会が増える。issue #71)。
  hCancel = () => {
    this.sheetDrag = null;
    const el = this.deps.getSheetEl();
    if (el) {
      el.style.transition = "transform .18s cubic-bezier(.3,.8,.4,1)";
      el.style.transform = "";
    }
  };
}
