# 02 技術設計

関連:[00_overview](./00_overview.md) / [imasoko-dev-docs.md](./imasoko-dev-docs.md)(API/WS/座標変換の一次資料)

このドキュメントは dev-docs の**再掲ではなく補完**。dev-docs で「未決定」「要調整」とされた項目を確定させ、設定・型・エラー処理・テスト・セキュリティの設計を追加する。dev-docs と矛盾する記述はここを優先し、確定後は dev-docs にも反映する。

## 1. 未決定事項の確定(推奨値と根拠)

[dev-docs §12](./imasoko-dev-docs.md) / [企画書 §8](./imasoko-kikakusho.md) の未決定事項に、ハッカソン向けの推奨値を提示する。チームで採否を決め、決めたら「決定」に更新する。

| 項目 | 推奨値 | 根拠 | 状態 |
|---|---|---|---|
| ルームTTL | **3時間** | 「今日のこの集合」に十分・メモリ肥大を防ぐ。`config.py` の定数1つで変更可 | 要合意 |
| `position` throttle | **2秒**(移動が無ければ送らない距離しきい値 5m 併用) | UXとサーバ負荷の妥協点。dev-docsの案を採用 | 要合意 |
| floor(階数)UI | 自己申告のセレクタ。既定は「未設定(null)」 | GPSで階数不可([企画書 §4.2](./imasoko-kikakusho.md)) | 決定 |
| 圏外(u,vが0..1外)表示 | **マップ端にクランプ + 一覧に「圏外」バッジ** | はぐれ検知に一覧が有用。実装が軽い | 要合意 |
| 途中退出機能 | **v1では自動のみ**(WS切断=`member_left`)。明示退出ボタンは任意 | スコープ最小化。切断検知で十分 | 要合意 |
| 位置履歴 | **最新値のみ保持・履歴を残さない**を明文化 | プライバシー設計([企画書 §8](./imasoko-kikakusho.md)) | 決定 |

## 2. 設定・定数の一元管理

マジックナンバーは散らさず、**backend / frontend それぞれ1モジュール**にまとめる。

### backend `app/config.py`

```python
from datetime import timedelta
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # ルーム
    room_ttl: timedelta = timedelta(hours=3)      # TTL(§1)
    room_id_bytes: int = 8                         # secrets.token_urlsafe(bytes) → 11文字程度
    # 掃除タスク
    cleanup_interval_seconds: int = 60             # 期限切れ掃除の実行間隔(§8/dev-docs)
    # 入力制限
    max_name_length: int = 20
    max_members_per_room: int = 50
    # 配信
    static_dir: str = "static"

    model_config = {"env_prefix": "IMASOKO_"}      # 環境変数 IMASOKO_ROOM_TTL 等で上書き可

settings = Settings()
```

> `pydantic-settings` を使うと環境変数上書きが無料で付く。導入したくなければ素の定数モジュールでもよい。**TTLはここ1箇所で変える**という原則だけ守る。

### frontend `src/lib/constants.ts`

```ts
export const POSITION_THROTTLE_MS = 2000;   // §1
export const POSITION_MIN_MOVE_M = 5;       // これ未満の移動は送らない
export const WS_RECONNECT_BASE_MS = 1000;   // 再接続バックオフの初期値(§5)
export const WS_RECONNECT_MAX_MS = 15000;
```

## 3. 環境変数

`.env.example` をコミットし、実 `.env` は `.gitignore`([01](./01_directory-design.md))。

| 変数 | 対象 | 例 | 用途 |
|---|---|---|---|
| `IMASOKO_ROOM_TTL` | backend | `PT3H` 相当/秒指定 | TTL上書き(任意) |
| `IMASOKO_STATIC_DIR` | backend | `static` | 静的配信先 |
| `VITE_WS_PATH` | frontend | `/ws` | WSパス(基本固定) |

ハッカソン規模では環境変数は最小限でよい。**同一オリジン配信のため API/WS のホスト指定は不要**(相対パス `/api` `/ws` を使う)。

## 4. 型・メッセージ契約の共有

WS/RESTのメッセージ形は front(TS)と back(Pydantic)で**二重定義**になる。ズレると実行時に壊れるため、**単一の真実(dev-docs §5/§6)を基準に、両者を突き合わせる**。

- back:`app/models.py` に Pydantic モデルを定義(`type` でタグ付けした Discriminated Union)
- front:`src/types/messages.ts` に対応する型を定義
- 変更時は**必ず両方を同じPRで更新**する(レビュー観点にする → [04](./04_github-templates.md) のPRテンプレに項目化)

### `app/models.py`(骨子)

```python
from typing import Literal, Optional, Union
from pydantic import BaseModel, Field

# --- client → server ---
class JoinMsg(BaseModel):
    type: Literal["join"]
    name: str = Field(min_length=1, max_length=20)
    floor: Optional[str] = None

class PositionMsg(BaseModel):
    type: Literal["position"]
    lat: float; lng: float
    accuracy: Optional[float] = None

class FloorMsg(BaseModel):
    type: Literal["floor"]
    floor: Optional[str] = None

class MeetingPointMsg(BaseModel):
    type: Literal["meeting_point"]
    lat: float; lng: float

ClientMsg = Union[JoinMsg, PositionMsg, FloorMsg, MeetingPointMsg]

# server → client のモデル(room_state, member_joined, member_update, member_left,
# meeting_point, room_expired)も同様に定義する。
```

`type` フィールドで分岐(`Field(discriminator="type")` を使うと安全にパースできる)。

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
| backend | **pytest**(+`httpx`/`TestClient`) | `rooms`:作成→取得→期限切れ(410)。`expiry`:掃除タスクが期限切れを消す。`ws`:join→room_state→position→broadcastの疎通 |
| frontend | **Vitest** | `coords.ts` の変換(§6)。可能なら `useRoomSocket` の状態遷移 |
| 手動 | 実機スマホ | HTTPS/WSS疎通・位置許可・複数端末での同時表示([dev-docs §9](./imasoko-dev-docs.md)) |

CIでこれらを回す設定は [03](./03_cicd.md)。**まずは coords と rooms のテストだけでも入れる**(壊れやすい箇所優先)。

## 9. ロギング・スケール前提

- **ロギング**:標準 `logging` で接続/切断/ルーム作成/期限切れをINFO。位置座標はログに残さない(プライバシー)
- **スケール**:インメモリ・単一プロセス前提。`uvicorn --workers` を増やすとルーム状態が共有されず壊れる → **本番は1ワーカー**で運用。将来複数ワーカーが必要になったら Redis pub/sub 等に置き換え(v1スコープ外)

## TODO

- [ ] §1の未決定6項目をチームで確定(TTL/throttle/圏外/退出)(担当:全員, ミーティング1回)
- [ ] `backend/app/config.py` を作成し、確定した定数を反映(担当:ホスト)
- [ ] `frontend/src/lib/constants.ts` を作成(担当:ホスト)
- [ ] `.env.example` を作成([01](./01_directory-design.md) の.gitignoreと対で)(担当:ホスト)
- [ ] `backend/app/models.py` にClient/Serverメッセージの Pydantic モデルを定義(担当:ホスト)
- [ ] `frontend/src/types/messages.ts` に対応TS型を定義(担当:ホスト)
- [ ] `useRoomSocket` に再接続バックオフ + join再送を実装(担当:ホスト, §5)
- [ ] `useGeolocation` に「拒否時=閲覧のみ」モードを実装(担当:ホスト)
- [ ] `coords.ts` の変換ユニットテストを作成(担当:ホスト, §6)
- [ ] キャリブレーション2点の実測 → `coords.ts` 定数差し替え(担当:マップ担当, §6)
- [ ] Pydanticで lat/lng・name・floor のバリデーションを実装(担当:初心者A/C, §7)
- [ ] 人数上限 join 拒否を実装(担当:初心者B, §7)
- [ ] pytest / vitest の最小テストを追加(担当:各自, §8)
- [ ] 決定事項を [imasoko-dev-docs.md](./imasoko-dev-docs.md) の §12 に反映(担当:ホスト)
