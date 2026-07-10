// 地図のジェスチャ処理(ポインタのパン / ピンチズーム / ホイールズーム / fit・center / FAB ズーム)を
// RoomEngine から切り出したコントローラ(issue #103)。engine から vpRef / state 読み取り / setState /
// toast を注入し、ジェスチャの内部状態(pointers・pan の drag・pinched フラグ)は本クラスが保持する。
// 計算式・クランプ・挙動は RoomEngine 時代から一切変えていない(構造抽出のみ)。

import type { PointerEvent, WheelEvent } from "react";
import type { AreaId } from "@/types/campus";
import { AREAS } from "@/lib/mapAreas";
import type { State } from "./RoomEngine";

// engine.setState と同じシグネチャ(パッチ or 更新関数 + 任意コールバック)。
type StateSetter = (
  patch: Partial<State> | ((s: State) => Partial<State>),
  cb?: () => void
) => void;

export interface MapGestureDeps {
  // ビューポート要素(engine が保持する vpRef.current)。
  getVp: () => HTMLDivElement | null;
  // 現在の engine 状態(view / area / members / selfId / pickMode を読む)。
  getState: () => State;
  // engine の setState 経由で状態を更新する(view のほかピン確定・エリア切替も含む)。
  setState: StateSetter;
  // トースト表示(FAB「現在地へ」で使用)。
  toast: (msg: string) => void;
}

// ズーム倍率の上限・下限(下限はエリア全体が収まる fit 倍率に対する比率。issue #167)
const ZOOM_MAX = 3.5;
const ZOOM_MIN_FIT_RATIO = 0.7;
// ズーム倍率を許容範囲にクランプする(ピンチ / ホイール / FAB ズームで共通)。
const clampZoom = (fit: number, k: number): number =>
  Math.min(ZOOM_MAX, Math.max(fit * ZOOM_MIN_FIT_RATIO, k));

export class MapGestureController {
  private deps: MapGestureDeps;

  private drag: { sx: number; sy: number; tx: number; ty: number; moved: boolean } | null = null;
  // 地図上のアクティブなポインタを pointerId 単位で保持(1本=パン / 2本=ピンチズーム。issue #68)。
  private pointers = new Map<number, { x: number; y: number }>();
  // 現在のジェスチャがピンチを含んだか(ピンチを集合地点タップに誤反応させないため)。
  private pinched = false;

  constructor(deps: MapGestureDeps) {
    this.deps = deps;
  }

  fitArea() {
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const A = AREAS[this.deps.getState().area];
    const k = Math.min(r.width / A.w, r.height / A.h) * 0.98;
    this.deps.setState({ view: { k, tx: (r.width - A.w * k) / 2, ty: (r.height - A.h * k) / 2 } });
  }
  centerOn(x: number, y: number, k?: number) {
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const kk = k || Math.max(this.deps.getState().view.k, 1);
    this.deps.setState({ view: { k: kk, tx: r.width / 2 - x * kk, ty: r.height / 2 - y * kk } });
  }
  pickArea(id: AreaId) {
    if (id === this.deps.getState().area) return;
    this.deps.setState({ area: id }, () => this.fitArea());
  }
  onMapDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest && (e.target as HTMLElement).closest("[data-nopan]"))
      return;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      // 2本目の指:ピンチへ遷移。単一パンは破棄し、以降は 2点間距離でズームする(issue #68)。
      this.drag = null;
      this.pinched = true;
      return;
    }
    // 1本目の指:従来どおりパン開始(この時点で新しいジェスチャの開始)。
    this.pinched = false;
    this.drag = {
      sx: e.clientX,
      sy: e.clientY,
      tx: this.deps.getState().view.tx,
      ty: this.deps.getState().view.ty,
      moved: false,
    };
  };
  onMapMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;

    // 2ポインタ:ピンチズーム。2点間距離の比でスケールし、2点の中点を中心にする。
    // 中点の移動分がそのままパンになる(ピンチしながらの平行移動に追従)。issue #68。
    if (this.pointers.size >= 2) {
      // 先頭2つの pointerId をピンチの2点として扱う(3本目以降は追跡のみで計算に使わない)。
      const [id0, id1] = [...this.pointers.keys()];
      const p0 = this.pointers.get(id0)!;
      const p1 = this.pointers.get(id1)!;
      const prevMidX = (p0.x + p1.x) / 2;
      const prevMidY = (p0.y + p1.y) / 2;
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      // 動いたポインタの新座標を反映(p は p0/p1 いずれかと同一参照)。prev は反映前に確定済み。
      p.x = e.clientX;
      p.y = e.clientY;
      const curMidX = (p0.x + p1.x) / 2;
      const curMidY = (p0.y + p1.y) / 2;
      const curDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      if (prevDist === 0 || curDist === 0) return;
      const vp = this.deps.getVp();
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const { tx, ty, k } = this.deps.getState().view;
      const A = AREAS[this.deps.getState().area];
      const fit = Math.min(r.width / A.w, r.height / A.h);
      const nk = clampZoom(fit, k * (curDist / prevDist));
      const pmx = prevMidX - r.left;
      const pmy = prevMidY - r.top;
      const cmx = curMidX - r.left;
      const cmy = curMidY - r.top;
      this.deps.setState({
        view: { k: nk, tx: cmx - ((pmx - tx) / k) * nk, ty: cmy - ((pmy - ty) / k) * nk },
      });
      return;
    }

    // 1ポインタ:従来どおりパン。格納座標も最新化しておく。パン中は drag だけ更新すると
    // pointers の座標が down 時のまま陳腐化し、この指が後からピンチの1本目になった際に
    // 2本目 down 直後の prevDist/prevMid が古くなって初回フレームがポップする(issue #68)。
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.drag) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.hypot(dx, dy) > 6) this.drag.moved = true;
    if (this.drag.moved)
      this.deps.setState({
        view: { ...this.deps.getState().view, tx: this.drag.tx + dx, ty: this.drag.ty + dy },
      });
  };
  onMapUp = (e: PointerEvent<HTMLDivElement>) => {
    const wasTracked = this.pointers.delete(e.pointerId);
    // まだ 2 本以上残っていればピンチ継続。
    if (this.pointers.size >= 2) return;
    // ピンチ → 1 本に減った場合:残る指でパンを継続(指を離した瞬間の破綻を防ぐ)。
    if (this.pointers.size === 1) {
      this.resumePanFromRemaining();
      return;
    }
    // 全ての指が離れた:ジェスチャ終了。
    const d = this.drag;
    const pinched = this.pinched;
    this.drag = null;
    this.pinched = false;
    // ピンチだった/地図外(FAB 等の追跡外)は集合地点タップにしない。
    if (pinched || !wasTracked) return;
    const state = this.deps.getState();
    if (!state.pickMode || !d || d.moved) return;
    if ((e.target as HTMLElement).closest && (e.target as HTMLElement).closest("[data-nopan]"))
      return;
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = state.view;
    const wx = (e.clientX - r.left - tx) / k;
    const wy = (e.clientY - r.top - ty) / k;
    const A = AREAS[state.area];
    if (wx < 0 || wy < 0 || wx > A.w || wy > A.h) return;
    this.deps.setState({
      pickMode: false,
      pinModal: true,
      pendingPin: { area: state.area, x: wx, y: wy },
      pinNote: "",
    });
  };
  // 指が離れた/中断された時のポインタ解放(pointercancel も同じ扱い。issue #68)。
  onMapCancel = (e: PointerEvent<HTMLDivElement>) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) this.resumePanFromRemaining();
    else if (this.pointers.size === 0) {
      this.drag = null;
      this.pinched = false;
    }
  };
  // ピンチ(2本)から 1 本に減った際、残る指の現在位置からパンを引き継ぐ。
  // moved:true で開始し、この持ち替えが集合地点タップに化けないようにする。
  private resumePanFromRemaining() {
    const [id] = [...this.pointers.keys()];
    const rp = this.pointers.get(id);
    if (!rp) return;
    const { tx, ty } = this.deps.getState().view;
    this.drag = { sx: rp.x, sy: rp.y, tx, ty, moved: true };
  }
  onMapWheel = (e: WheelEvent<HTMLDivElement>) => {
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.deps.getState().view;
    const A = AREAS[this.deps.getState().area];
    const fit = Math.min(r.width / A.w, r.height / A.h);
    const nk = clampZoom(fit, k * Math.exp(-e.deltaY * 0.0016));
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    this.deps.setState({
      view: { k: nk, tx: cx - ((cx - tx) / k) * nk, ty: cy - ((cy - ty) / k) * nk },
    });
  };
  private zoomBy(f: number) {
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const { tx, ty, k } = this.deps.getState().view;
    const A = AREAS[this.deps.getState().area];
    const fit = Math.min(r.width / A.w, r.height / A.h);
    const nk = clampZoom(fit, k * f);
    const cx = r.width / 2;
    const cy = r.height / 2;
    this.deps.setState({
      view: { k: nk, tx: cx - ((cx - tx) / k) * nk, ty: cy - ((cy - ty) / k) * nk },
    });
  }
  fabZoomIn = () => this.zoomBy(1.35);
  fabZoomOut = () => this.zoomBy(1 / 1.35);
  fabSelf = () => {
    const s = this.deps.getState();
    const self = s.members.find((m) => m.id === s.selfId);
    if (!self || self.viewer) {
      this.deps.toast("位置情報を共有していません");
      return;
    }
    if (self.area !== s.area) {
      this.deps.setState({ area: self.area }, () => this.centerOn(self.x, self.y, 1.2));
      return;
    }
    this.centerOn(self.x, self.y, Math.max(s.view.k, 1.2));
  };
  fabFit = () => {
    const s = this.deps.getState();
    const pts = s.members.filter((m) => !m.lost && !m.viewer && m.area === s.area);
    if (!pts.length) {
      this.fitArea();
      return;
    }
    const vp = this.deps.getVp();
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const x0 = Math.min(...pts.map((p) => p.x)) - 70;
    const x1 = Math.max(...pts.map((p) => p.x)) + 70;
    const y0 = Math.min(...pts.map((p) => p.y)) - 90;
    const y1 = Math.max(...pts.map((p) => p.y)) + 60;
    const k = Math.min(3, Math.min(r.width / (x1 - x0), r.height / (y1 - y0)));
    this.deps.setState({
      view: { k, tx: r.width / 2 - ((x0 + x1) / 2) * k, ty: r.height / 2 - ((y0 + y1) / 2) * k },
    });
  };
}
