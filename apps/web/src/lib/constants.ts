// フロント定数の一元管理(docs/02 §2)。

// 位置送信スロットリング(docs/02 §1・§2。実機で確定予定)
export const POSITION_THROTTLE_MS = 2000;
export const POSITION_MIN_MOVE_M = 5; // これ未満の移動は送らない

// WS 再接続バックオフ(docs/02 §5)
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 15000;

// プロトタイプ固有:集合時間を指定し、その3時間後にルームを自動終了する
// (docs は「作成から2時間」だが、プロトタイプ忠実のためこちらを採用。README 参照)
export const END_OFFSET = 3 * 3600000;

// デモ用シミュレーション設定
export const SIM_MOVING = true;
export const SIM_WALK_SPEED = 2.6;

// WSパス(docs/02 §3)
export const WS_PATH = "/ws";
