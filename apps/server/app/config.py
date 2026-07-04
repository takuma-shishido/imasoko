"""設定・定数の一元管理(docs/02 §2)。

有効期限のオフセットはここ1箇所で変える(環境変数 IMASOKO_END_OFFSET_SECONDS でも上書き可)。

※ 有効期限モデル(issue #4 でチーム決定):
  「集合時間(meet_at)+ 3時間」で自動終了する。フロント(END_OFFSET = 3h,
  apps/web/src/lib/constants.ts)とサーバーはこのモデルで一致させる。
  → expires_at = meet_at + end_offset_seconds。meet_at 未指定時は作成時刻を集合時間とみなす。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ルーム
    end_offset_seconds: int = 3 * 3600  # 集合時間から+3h で終了(issue #4・front END_OFFSET)
    room_id_bytes: int = 8  # secrets.token_urlsafe(bytes) → 11文字程度
    host_token_bytes: int = 16
    # 掃除タスク
    cleanup_interval_seconds: int = 60  # 期限切れ掃除の実行間隔(dev-docs §8)
    # 入力制限
    max_name_length: int = 20
    max_members_per_room: int = 50
    # 配信
    static_dir: str = "static"

    model_config = SettingsConfigDict(env_prefix="IMASOKO_")


settings = Settings()
