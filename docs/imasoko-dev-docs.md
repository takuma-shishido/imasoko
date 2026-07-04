# いまそこ 開発ドキュメント

対象読者:開発メンバー4人。企画書(imasoko-kikakusho.md)と対になる技術文書。
(案)と記した箇所は提案であり、チームで変更してよい。

---

## 1. 全体像

```
┌────────────────────────┐         ┌────────────────────────────┐
│ ブラウザ(スマホ想定)      │         │ 個人サーバー                 │
│                        │  HTTPS  │                            │
│ React + TS (Vite)      │────────▶│ リバースプロキシ(TLS終端)     │
│  ├ Leaflet             │   WSS   │   └▶ FastAPI               │
│  │  └ 自作マップ画像を    │◀────────│       ├ REST: ルーム作成     │
│  │    imageOverlay表示  │         │       ├ WS: 位置の送受信     │
│  ├ Geolocation API     │         │       ├ ルーム状態(インメモリ)│
│  └ 座標変換 (lib/coords) │         │       ├ 有効期限管理         │
│                        │         │       └ 静的ファイル配信      │
└────────────────────────┘         └────────────────────────────┘
```

- データベースなし。ルーム状態はすべてサーバープロセスのメモリ上に持つ
- フロントのビルド成果物は FastAPI から配信し、同一オリジンにまとめる(CORS不要)

## 2. 技術スタック

| 領域 | 技術 |
|---|---|
| フロントエンド | React + TypeScript, Vite |
| 地図 | Leaflet(`L.CRS.Simple` + `L.imageOverlay` で自作マップ画像を表示) |
| 位置取得 | ブラウザ標準 Geolocation API(`watchPosition`) |
| バックエンド | Python 3.12+, FastAPI, uvicorn |
| リアルタイム通信 | WebSocket(FastAPI標準サポート) |
| デプロイ | 個人サーバー + リバースプロキシ(TLS終端・WS中継) |

## 3. ディレクトリ構成(案)

> **確定版のディレクトリ構成は [docs/01](./01_directory-design.md) を参照**(`apps/web` / `apps/server`。トップレベルに frontend/backend を並べない方針に更新)。以下は初期の素案。

```
imasoko/
├ frontend/
│  ├ src/
│  │  ├ components/     # MapView, JoinForm, ShareButton など
│  │  ├ hooks/          # useGeolocation, useRoomSocket
│  │  ├ lib/
│  │  │  ├ coords.ts    # 緯度経度 → マップ座標の変換(§7)
│  │  │  └ api.ts       # REST呼び出し
│  │  ├ App.tsx
│  │  └ main.tsx
│  ├ public/map/        # 自作マップ画像
│  └ vite.config.ts
├ backend/
│  ├ app/
│  │  ├ main.py         # FastAPIエントリ・静的配信・ルーティング
│  │  ├ rooms.py        # ルームの作成・取得・有効期限(担当:初心者A/B)
│  │  ├ ws.py           # WebSocketエンドポイント・ConnectionManager(骨格:ホスト)
│  │  └ models.py       # Pydanticモデル(メッセージ定義)
│  └ requirements.txt
└ docs/
```

## 4. 画面とルーティング

| パス | 画面 |
|---|---|
| `/` | トップ。「ルームを作る」+「公開ルームを探す」 |
| `/public` | 公開ルーム一覧(active な public ルーム) |
| `/r/{roomId}` | ルーム画面。未参加なら名前・階数の入力フォーム → 参加後はマップ |

SPA(React Router)。FastAPI側は未知のパスを `index.html` にフォールバックさせる。
**画面ごとの詳細設計は [docs/design/](./design/00_index.md)。**

## 5. REST API

### POST `/api/rooms` — ルーム作成

レスポンス:
```json
{ "room_id": "Xy3kPq9AbCd", "expires_at": "2026-07-03T18:00:00+09:00" }
```

- `room_id` は `secrets.token_urlsafe()` 等で生成する推測困難なランダム文字列
- `expires_at = 作成時刻 + TTL`。TTLの具体値は未決定(企画書8章)。**定数1箇所で変更できるように実装する**

### GET `/api/rooms/{room_id}` — ルーム確認

参加画面を表示する前の存在・期限チェックに使う。

```json
{ "status": "active", "expires_at": "..." }
```

期限切れ・存在しない場合は `410 Gone` / `404 Not Found`。

> 公開範囲(private/public)・`host_token`・`GET /api/rooms/public`・`GET /api/campus` などのREST拡張は [docs/05 §6](./05_feature-design.md) を参照。

## 6. WebSocket設計

エンドポイント:`/ws/{room_id}`

すべてのメッセージはJSONで、`type` フィールドで種別を判別する。

### 接続フロー

1. クライアントが接続し、最初に `join` を送る
2. サーバーは参加者IDを発行し、本人に `room_state`(現在の全員の状態)を返す
3. 他の参加者には `member_joined` をブロードキャストする

### クライアント → サーバー

```json
{ "type": "join", "name": "たくま", "building_id": null, "floor": null }
{ "type": "position", "lat": 35.6581, "lng": 139.5432, "accuracy": 12.0 }
{ "type": "floor", "building_id": "b1", "floor": "3F" }
{ "type": "meeting_point", "lat": 35.6579, "lng": 139.5440 }
```

- `position` は `watchPosition` のコールバックから送るが、最短送信間隔を設けてスロットリングする(間隔は要調整。案:2秒)
- `floor` は自己申告の階数変更。`building_id` は屋内で建物を選んだ場合に付き、**建物ごと・階ごとのメンバー表示**([05 §2](./05_feature-design.md))に使う。どちらも `null` で解除(屋外/未設定)
- `meeting_point` は誰でも送信可能(企画書4.4)

### サーバー → クライアント

```json
{ "type": "room_state",
  "self_id": "a1b2",
  "members": [
    { "id": "a1b2", "name": "たくま", "building_id": null, "floor": "3F",
      "lat": 35.6581, "lng": 139.5432, "updated_at": "..." }
  ],
  "meeting_point": { "lat": 35.6579, "lng": 139.5440 },
  "expires_at": "..." }

{ "type": "member_joined", "member": { ... } }
{ "type": "member_update", "member": { ... } }
{ "type": "member_left", "id": "a1b2" }
{ "type": "meeting_point", "lat": ..., "lng": ... }
{ "type": "room_expired" }
```

- 参加者 `id` はサーバーが接続ごとに発行する(uuid短縮などでよい)
- `room_expired` 送信後、サーバーは全接続を切断する
- 位置は**最新値のみ**保持し、履歴はサーバーに残さない

> 明示退出(`leave`)・集合場所の3タイプ(`meeting_point` union)・空き教室候補(`add_place_suggestion` / `place_suggestions`)などのWS拡張は [docs/05 §6](./05_feature-design.md) を参照。

## 7. 座標変換(緯度経度 → 自作マップ座標)

### 前提(重要)

**自作マップは、建物・通路の配置と縮尺を実際の地理に忠実に描くこと。** スタイリング(色・線・ラベル)は自由だが、配置をデフォルメすると以下の線形変換が成立せず、ピン位置が実際とズレる。衛星写真やOSMを下敷きにトレースして作る。

キャンパス程度の狭い範囲では、緯度経度を平面座標として線形に扱って問題ない(歪みは無視できる)。

### キャリブレーション

マップ画像の対角2点について、実世界の緯度経度を測っておく:

- 画像の左上端に対応する実座標:`(lat0, lng0)`(北西角)
- 画像の右下端に対応する実座標:`(lat1, lng1)`(南東角)

この2組を `apps/web/src/lib/mapAreas.ts` に**エリアごと**の定数として置く(マップは駅×2 + キャンパスの3エリア。[docs/05 §1](./05_feature-design.md))。緯度経度の実測はスマホの地図アプリ等で行える。

### 変換式

画像サイズを `W × H`(px)とする。参加者の位置 `(lat, lng)` に対して:

```
u = (lng - lng0) / (lng1 - lng0)      // 0..1、左→右
v = (lat0 - lat) / (lat0 - lat1)      // 0..1、上→下
```

Leaflet を `CRS.Simple`、`imageOverlay` の bounds を `[[0, 0], [H, W]]` で使う場合、マーカー座標は:

```
L.latLng((1 - v) * H, u * W)
```

(`CRS.Simple` では第1成分=縦軸で上ほど大きいため、`1 - v` で反転する)

### 範囲外の扱い

**決定:キャンパス外にいる参加者(`u, v` が 0..1 の外)は、`u, v` を 0..1 にクランプしてマップ端にピンを表示し、「圏外」ラベルを付ける。** マップ端のどの位置に出るかで、はぐれた相手がどの方向にいるかの目安になる。実装は座標変換側でクランプと「圏外フラグ」を返し、UIはフラグを見てピンを「圏外」表示(ラベル付き・色替え等)に切り替える。

## 8. ルームの有効期限(企画書4.5)

- ルーム作成時に `expires_at` を記録する。TTLは**既定2時間・設定可**([docs/02 §2](./02_technical-design.md) の `config.py`)
- REST・WS接続時の両方で期限をチェックし、期限切れなら拒否する
- サーバー側で定期実行するバックグラウンドタスク(asyncioループ)が期限切れルームを検出し、`room_expired` を全員に送って切断・ルーム削除する

## 9. 開発環境

```
server (apps/server):  uvicorn app.main:app --reload   # :8000
web    (apps/web)   :  npm run dev                     # :5173
```

- Viteの `server.proxy` で `/api` と `/ws` を `:8000` に転送する(`/ws` は `ws: true` を指定)
- **スマホ実機テスト**:Geolocation API はHTTPS必須(`localhost` のみ例外)なので、スマホからの確認には cloudflared / ngrok 等でローカルをHTTPS公開する。**WSS接続が通ることを早期に確認しておく**

## 10. 本番デプロイ(個人サーバー)

- `npm run build` の成果物を FastAPI の `StaticFiles` で配信する
- リバースプロキシで TLS終端。`/ws` の WebSocket 中継(nginxの場合 `Upgrade` / `Connection` ヘッダーの転送)を設定する
- ポートは443で公開する(デモ会場のWi-Fiで非標準ポートが塞がれている場合に備える)
- 不特定多数がURLで参加できるため、リバースプロキシ配下にFastAPIのみを公開し、軽いレート制限を入れる(案)
- サーバー上のプロセス管理(systemd / Docker 等)はサーバー運用者の流儀に合わせる

## 11. 分担(案)

| 担当 | 内容 |
|---|---|
| ホスト(フルスタック) | フロント全般(React/Leaflet/座標変換)、WSのConnectionManager骨格、デプロイ |
| 初心者A | `rooms.py`:ルーム作成API、`room_id` 発行(§5) |
| 初心者B | 有効期限まわり:`expires_at` チェック、期限切れルームの掃除タスク(§8) |
| 初心者C | WSメッセージ処理関数の実装(`join` / `floor` の処理)、実機テスト、マップのキャリブレーション補助(§7) |

WebSocketの接続管理(参加者リスト保持・切断処理・ブロードキャスト)はホストが骨格を書き、初心者はその中のメッセージ処理関数を埋める形にする。

## 12. 未決定事項

- `position` 送信のスロットリング間隔(案:2秒。実機で確定)

### 決定済み(旧・未決定事項)

- キャンパス外の表示(§7):マップ端にクランプして「圏外」表示
- マップ:形式=**SVG** / 対象=**有明キャンパス** / 作画=**ホスト**。**3エリア切替**(駅×2 + キャンパス)
- ルームTTL:**既定2時間**(設定可)
- 途中退出:**可能**(明示退出 + 切断)
- ルーム公開範囲:**private / public 切替・既定 private**
- 集合場所:**座標 / メンバー / 場所**の3タイプ + 空き教室のユーザー追加(当面CSV)

新機能(マップ3エリア・建物ドリルダウン・公開範囲・集合場所拡張・空き教室CSV)の詳細設計は [docs/05_feature-design.md](./05_feature-design.md)。
