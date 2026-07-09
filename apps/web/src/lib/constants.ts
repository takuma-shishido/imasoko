// フロント定数の一元管理(docs/02 §2)。

import type { ConfigRes } from "@/types/messages";

// 位置送信スロットリング(docs/02 §1・§2。実機で確定予定)
export const POSITION_THROTTLE_MS = 2000;
export const POSITION_MIN_MOVE_M = 5; // これ未満の移動は送らない

// WS 再接続バックオフ(docs/02 §5)
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 15000;

// 有効期限モデル(issue #4 でチーム決定):集合時間を指定し、その3時間後にルームを自動終了する。
// サーバーも同モデル(expires_at = meet_at + end_offset_seconds, apps/server/app/config.py)で一致。
// 以下 3 つは GET /api/config 取得前・取得失敗時のフォールバック既定値(実値は serverConfig。issue #15)。
export const END_OFFSET = 3 * 3600000;
export const MAX_NAME_LENGTH = 20; // 表示名の最大文字数(server: max_name_length)
export const MAX_MEMBERS_PER_ROOM = 50; // 1ルームの最大人数(server: max_members_per_room)

// サーバー設定(GET /api/config)の保持先。取得前・取得失敗時は上のフォールバック値のまま(issue #15)。
// setServerConfig で中身だけ差し替える(参照は不変。campusData.ts の setBuildings と同方式)。
export const serverConfig = {
  endOffsetMs: END_OFFSET,
  maxNameLength: MAX_NAME_LENGTH,
  maxMembersPerRoom: MAX_MEMBERS_PER_ROOM,
};

export function setServerConfig(res: ConfigRes): void {
  serverConfig.endOffsetMs = res.end_offset_seconds * 1000; // 秒 → ms
  serverConfig.maxNameLength = res.max_name_length;
  serverConfig.maxMembersPerRoom = res.max_members_per_room;
}
