# 02 技術設計

関連:[00_overview](./00_overview.md) / [imasoko-dev-docs.md](./imasoko-dev-docs.md)(API/WS/座標変換の一次資料)

このドキュメントは dev-docs の**再掲ではなく補完**。dev-docs で「未決定」「要調整」とされた項目を確定させ、設定・型・エラー処理・テスト・セキュリティの設計を追加する。dev-docs と矛盾する記述はここを優先し、確定後は dev-docs にも反映する。

## 1. 未決定事項の確定(推奨値と根拠)

[dev-docs §12](./imasoko-dev-docs.md) / [企画書 §8](./imasoko-kikakusho.md) の未決定事項に、ハッカソン向けの推奨値を提示する。チームで採否を決め、決めたら「決定」に更新する。

| 項目 | 推奨値 | 根拠 | 状態 |
|---|---|---|---|
| ルームTTL | **2時間(既定・設定可)** | 「今日のこの集合」に十分・メモリ肥大を防ぐ。`config.py` の定数1つで変更可 | 決定 |
| `position` throttle | **2秒**(移動が無ければ送らない距離しきい値 5m 併用) | UXとサーバ負荷の妥協点。dev-docsの案を採用 | 要合意 |
| floor(階数)UI | 自己申告のセレクタ。既定は「未設定(null)」 | GPSで階数不可([企画書 §4.2](./imasoko-kikakusho.md)) | 決定 |
| 圏外(u,vが0..1外)表示 | **`u,v` を 0..1 にクランプしてマップ端にピンを表示し「圏外」ラベルを付ける** | 端の位置で相手の方向が分かる。実装が軽い([dev-docs §7](./imasoko-dev-docs.md)) | 決定 |
| 途中退出機能 | **可能**(明示退出ボタン + WS切断の両方で `member_left`) | 参加者が能動的に抜けられる([05](./05_feature-design.md)) | 決定 |
| 位置履歴 | **最新値のみ保持・履歴を残さない**を明文化 | プライバシー設計([企画書 §8](./imasoko-kikakusho.md)) | 決定 |
| ルーム公開範囲 | **private / public 切替・既定 private**（[05 §3](./05_feature-design.md)） | 既定は使い捨て前提、public は opt-in | 決定 |
| マップ | **SVG / 有明キャンパス / 作画=ホスト**。3エリア切替([05 §1](./05_feature-design.md)) | ズームで滲まない・実地理に忠実 | 決定 |

## 2. 設定・定数の一元管理

マジックナンバーは散らさず、**server / web それぞれ1モジュール**にまとめる。

### server 側 `apps/server/app/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # ルーム(有効期限は「集合時間 + 3h」= end_offset_seconds, issue #4)
    end_offset_seconds: int = 3 * 3600             # front END_OFFSET と一致
    room_id_bytes: int = 8                         # secrets.token_urlsafe(bytes) → 11文字程度
    host_token_bytes: int = 16
    # 掃除タスク
    cleanup_interval_seconds: int = 60             # 期限切れ掃除の実行間隔(§8/dev-docs)
    # 入力制限
    max_name_length: int = 20
    max_members_per_room: int = 50
    # 配信
    static_dir: str = "static"

    model_config = SettingsConfigDict(env_prefix="IMASOKO_")  # IMASOKO_END_OFFSET_SECONDS 等で上書き可

settings = Settings()
```

> `pydantic-settings` を使うと環境変数上書きが無料で付く。導入したくなければ素の定数モジュールでもよい。**TTLはここ1箇所で変える**という原則だけ守る。

### web 側 `apps/web/src/lib/constants.ts`

```ts
export const POSITION_THROTTLE_MS = 2000;   // §1
export const POSITION_MIN_MOVE_M = 5;       // これ未満の移動は送らない
export const WS_RECONNECT_BASE_MS = 1000;   // 再接続バックオフの初期値(§5)
export const WS_RECONNECT_MAX_MS = 15000;
```

## 3. 環境変数

`apps/server/.env.example` をコミットし、実 `.env` は `.gitignore`([01](./01_directory-design.md))。

| 変数 | 対象 | 例 | 用途 |
|---|---|---|---|
| `IMASOKO_END_OFFSET_SECONDS` | server | `10800` | 有効期限オフセット(秒)上書き(任意) |
| `IMASOKO_STATIC_DIR` | server | `static` | 静的配信先 |
| `VITE_WS_PATH` | web | `/ws` | WSパス(基本固定) |

ハッカソン規模では環境変数は最小限でよい。**同一オリジン配信のため API/WS のホスト指定は不要**(相対パス `/api` `/ws` を使う)。

## 4. 型・メッセージ契約の共有

WS/RESTのメッセージ形は web(TS)と server(Pydantic)で**二重定義**になる。ズレると実行時に壊れるため、**単一の真実(dev-docs §5/§6)を基準に、両者を突き合わせる**。

- server:`apps/server/app/models.py` に Pydantic モデルを定義(`type` でタグ付けした Discriminated Union)
- web:`apps/web/src/types/messages.ts` に対応する型を定義
- 変更時は**必ず両方を同じPRで更新**する(レビュー観点にする → [04](./04_github-templates.md) のPRテンプレに項目化)

### `apps/server/app/models.py`(骨子)

```python
from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field

# --- client → server(type で分岐する Discriminated Union)---
class JoinMsg(BaseModel):
    type: Literal["join"]
    name: str = Field(min_length=1, max_length=20)
    building_id: str | None = None      # 屋内で建物を選んだ場合(05 §2, design)
    floor: str | None = None

class PositionMsg(BaseModel):
    type: Literal["position"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = None

# FloorMsg / MeetingPointMsg(point: MeetingPoint|None)/ AddPlaceSuggestionMsg / LeaveMsg も同様
ClientMsg = Annotated[
    Union[JoinMsg, PositionMsg, FloorMsg, MeetingPointMsg, AddPlaceSuggestionMsg, LeaveMsg],
    Field(discriminator="type"),
]

# --- server → client(型付きメッセージ・type は MsgType(str, Enum) 定数)---
class MsgType(str, Enum):
    ROOM_STATE = "room_state"
    # MEMBER_JOINED / MEMBER_LEFT / MEMBER_UPDATE / MEETING_POINT /
    # PLACE_SUGGESTIONS / ROOM_EXPIRED / ROOM_FULL

class RoomStateMsg(BaseModel):
    type: MsgType = MsgType.ROOM_STATE
    self_id: str
    members: list[dict]                 # Member.to_dict() を単一の真実に
    meeting_point: MeetingPoint | None = None
    expires_at: str
# MemberJoinedMsg / MemberUpdateMsg / MemberLeftMsg / MeetingPointBroadcastMsg /
# PlaceSuggestionsMsg / RoomExpiredMsg / RoomFullMsg も同様に型付き定義済み
```

`type` フィールドで分岐(`Field(discriminator="type")` を使うと安全にパースできる)。

> 公開範囲(`visibility`/`host_token`)・集合場所の3タイプ(`MeetingPoint` union)・空き教室候補(`PlaceSuggestion`)・退出(`leave`)などの拡張メッセージ/モデルは [05 §6](./05_feature-design.md) に定義。web/server の二重定義を同じPRで揃える原則は同じ。

## 5. WebSocket 再接続・エラーハンドリング

dev-docs §6 の正常系に加え、実機(スマホ・不安定なWi-Fi)で必須の異常系を設計する。

- **再接続**:切断されたら指数バックオフ(`WS_RECONNECT_BASE_MS`→最大 `WS_RECONNECT_MAX_MS`)で再接続。再接続後は**必ず `join` を再送**して `room_state` を取り直す(サーバは新IDを発行し得る前提)
- **不正メッセージ**:サーバはパース失敗メッセージを**無視 or エラー返却して継続**(1クライアントの不正で全体を落とさない)
- **`room_expired` 受信**:UIを「終了」表示に切り替え、再接続しない
- **位置未許可**:`useGeolocation` が拒否を検知したら「閲覧のみ参加」モードに([企画書 §4.2](./imasoko-kikakusho.md) の案)。`position` は送らず受信のみ
- **サーバ側切断処理**:WS切断・例外時に `ConnectionManager` から確実に除去し `member_left` をブロードキャスト(finally で実施)

## 6. 座標変換のテスト方針([dev-docs §7](./imasoko-dev-docs.md))

座標変換はズレると全機能が破綻するため、**ユニットテスト必須**。

- `coords.ts` の変換を、既知の対応点でテスト:
  - 北西角 `(lat0, lng0)` → 画像 `(x=0, y=H)`(CRS.Simple, bounds `[[0,0],[H,W]]`)
  - 南東角 `(lat1, lng1)` → 画像 `(x=W, y=0)`
  - 中央 → `(W/2, H/2)`
- キャリブレーション2点(`lat0/lng0/lat1/lng1`)は定数化し、**実測後に差し替え**る運用にする
- 範囲外入力(u,vが0..1外)でクランプ + 圏外フラグを返す関数を用意し、それもテストする(§1の圏外表示)

## 7. セキュリティ設計

不特定多数がURLで参加できる前提([dev-docs §10](./imasoko-dev-docs.md))なので、最小限の防御を入れる。

- **room_id エントロピー**:`secrets.token_urlsafe(8)`(≈64bit)。総当たり困難
- **入力バリデーション**:name長・floor値・lat/lng範囲(-90..90 / -180..180)をPydanticで検証。範囲外は拒否
- **XSS**:名前はReactが自動エスケープ。`dangerouslySetInnerHTML` は使わない
- **レート制限(案)**:リバースプロキシ側で軽い制限(ルーム作成API・WS接続数)。ハッカソンでは後回し可
- **人数上限**:`max_members_per_room` を超える join を拒否(メモリ保護)
- **位置の妥当性**:キャンパス範囲から極端に外れる座標は「圏外」扱いに留め、他者に生の座標をそのまま信用させない
- **CORS**:同一オリジン配信のため本番は不要。dev時のみ Vite proxy 経由([dev-docs §9](./imasoko-dev-docs.md))

## 8. テスト戦略

| 対象 | ツール | 最低限やること |
|---|---|---|
| server | **pytest**(+`httpx`/`TestClient`) | `rooms`:作成→取得→期限切れ(410)。`expiry`:掃除タスクが期限切れを消す。`ws`:join→room_state→position→broadcastの疎通 |
| web | **Vitest** | `coords.ts` の変換(§6)。可能なら `useRoomSocket` の状態遷移 |
| 手動 | 実機スマホ | HTTPS/WSS疎通・位置許可・複数端末での同時表示([dev-docs §9](./imasoko-dev-docs.md)) |

CIでこれらを回す設定は [03](./03_cicd.md)。**まずは coords と rooms のテストだけでも入れる**(壊れやすい箇所優先)。

## 9. ロギング・スケール前提

- **ロギング**:標準 `logging` で接続/切断/ルーム作成/期限切れをINFO。位置座標はログに残さない(プライバシー)
- **スケール**:インメモリ・単一プロセス前提。`uvicorn --workers` を増やすとルーム状態が共有されず壊れる → **本番は1ワーカー**で運用。将来複数ワーカーが必要になったら Redis pub/sub 等に置き換え(v1スコープ外)

## TODO

> 現状の詳細は [06 実装ステータス §4.1/§4.2](./06_implementation-status.md)。

- [ ] 残る「要合意」:**`position` スロットリング間隔**(実測)。※**有効期限モデルは集合時間+3h に統一済み**(issue #4, [06 §2](./06_implementation-status.md))
- [x] `apps/server/app/config.py` を作成(※有効期限は `end_offset_seconds: int`(集合時間+3h, issue #4)で実装。旧案の作成起点 `room_ttl` からモデル変更)
- [x] `apps/web/src/lib/constants.ts` を作成
- [x] `apps/server/.env.example` を作成
- [x] `apps/server/app/models.py` にClient/Serverメッセージの Pydantic モデルを定義
- [x] `apps/web/src/types/messages.ts` に対応TS型を定義
- [x] `useRoomSocket` に再接続バックオフ + join再送を実装し実サーバーへ配線(§5・issue #1)
- [x] `useGeolocation` に「拒否時=閲覧のみ」モードを実装し実GPSへ配線(§5・issue #2)
- [x] `coords.ts` の変換ユニットテストを作成(§6)
- [ ] キャリブレーション2点の実測 → `coords.ts`/`mapAreas.ts` 定数差し替え(現状プレースホルダ, §6)
- [x] Pydanticで lat/lng・name・floor のバリデーションを実装(§7)
- [x] 人数上限 join 拒否を実装(§7)
- [x] pytest / vitest の最小テストを追加(§8)
- [ ] 決定事項を [imasoko-dev-docs.md](./imasoko-dev-docs.md) の §12 に反映(担当:ホスト)
