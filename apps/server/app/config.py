"""設定・定数の一元管理(docs/02 §2)。

TTL はここ1箇所で変える(環境変数 IMASOKO_ROOM_TTL_SECONDS でも上書き可)。

※ 有効期限モデルについて:
  docs は「作成から2時間」。フロントのプロトタイプは「集合時間の3時間後に自動終了」。
  バックエンド雛形は docs 準拠(作成から room_ttl_seconds)。実配線時に方針を統一する(README 参照)。
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ルーム
    room_ttl_seconds: int = 2 * 3600  # TTL 既定2h(docs/02 §1)
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
