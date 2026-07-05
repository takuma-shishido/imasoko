// 実位置取得(issue #2)のコントローラ:RoomContext(useGeolocation)から実測位置を
// 受け取り、自分ピンを即時反映して送信は throttle する。
// issue #74 で RoomEngine.ts から切り出し(ロジックは移植のまま)。

import { POSITION_MIN_MOVE_M, POSITION_THROTTLE_MS } from "@/lib/constants";
import { metersBetween } from "@/lib/coords";
import { locate } from "@/lib/wire";
import type { EngineCore } from "./types";
import type { MapViewController } from "./MapViewController";

export class GeoController {
  // 位置送信スロットリング(2秒 / 5m。issue #2)。
  private lastPosSentAt = 0;
  private lastSentPos: { lat: number; lng: number } | null = null;
  private geoFirstFix = true; // 最初の測位でビューを現在エリアへ合わせる

  constructor(
    private core: EngineCore,
    private map: MapViewController
  ) {}

  /** 入室時に throttle・初回測位フラグをリセットする(issue #2)。 */
  reset() {
    this.lastPosSentAt = 0;
    this.lastSentPos = null;
    this.geoFirstFix = true;
  }

  onGeoPosition = (lat: number, lng: number, accuracy: number) => {
    const loc = locate(lat, lng);
    this.core.setState((s) => ({
      members: s.members.map((m) =>
        m.id === s.selfId
          ? { ...m, area: loc.area, x: loc.x, y: loc.y, lost: loc.lost, viewer: false, lat, lng }
          : m
      ),
    }));
    // 最初の測位でビューを現在エリアへ合わせる(現在エリアの自動選択)。
    if (this.geoFirstFix && !loc.lost) {
      this.geoFirstFix = false;
      if (loc.area !== this.core.state.area)
        this.core.setState({ area: loc.area }, () => this.map.fitArea());
    }
    // throttle:初回は即送信、以降は 2秒 かつ 前回送信位置から 5m 以上動いたら送る(docs/02 §2)。
    const now = Date.now();
    const first = this.lastSentPos === null;
    const movedEnough =
      !first && metersBetween(this.lastSentPos!, { lat, lng }) >= POSITION_MIN_MOVE_M;
    if (first || (now - this.lastPosSentAt >= POSITION_THROTTLE_MS && movedEnough)) {
      this.core.send({ type: "position", lat, lng, accuracy });
      this.lastPosSentAt = now;
      this.lastSentPos = { lat, lng };
    }
  };
  // 許可拒否/非対応 → 閲覧のみモードへフォールバック。
  onGeoDenied = (unsupported: boolean) => {
    if (this.core.state.viewerOnly) return;
    this.core.setState({ viewerOnly: true });
    this.core.toast(
      unsupported
        ? "この端末では位置情報を取得できません。閲覧のみで表示します"
        : "位置情報が許可されなかったため、閲覧のみで表示します"
    );
  };
}
