# 07 API 設計(REST / WebSocket・具体例つき)

関連:[dev-docs §5/§6](./imasoko-dev-docs.md)(一次資料)/ [05 §6](./05_feature-design.md)(拡張)/ [02 §4](./02_technical-design.md)(型契約)/ [06 実装ステータス](./06_implementation-status.md)

このドキュメントは、実装済みサーバー `apps/server` の **REST / WebSocket の具体仕様**を、リクエスト/レスポンスの実例つきでまとめたもの。
**人が実装・改修する際のリファレンス**。型は web(`apps/web/src/types/messages.ts`)と server(`apps/server/app/models.py`)の二重定義になっているため、**変更時は両方を同じPRで更新**する([02 §4](./02_technical-design.md))。

---

## 0. 前提・共通事項

- **ベースURL**:同一オリジン。開発時はフロント `http://localhost:5173` から Vite proxy 経由で `http://localhost:8000` へ(dev-docs §9)。以下の例は直接 `:8000` を叩く形。
- **データ**:すべてインメモリ(DBなし)。プロセス再起動で消える。**本番は1ワーカー**運用([02 §9](./02_technical-design.md))。
- **文字コード / 形式**:`application/json; charset=utf-8`。日時は **ISO 8601(タイムゾーン付き)**(例:`2026-07-04T03:42:20.614529+00:00`)。
- **認証**:ログインなし。host 限定操作のみ **`host_token`**(作成時に払い出し、`localStorage` 保存)を HTTP ヘッダー `x-host-token` で送る。
- **エラー形式**:FastAPI 標準。`{"detail": "..."}`(バリデーションエラーは `{"detail": [ ... ]}` の 422)。

### ステータスコード早見

| コード | 意味 | 例 |
|---|---|---|
| `200` | 正常 | 取得・作成・更新成功 |
| `403` | 権限なし | `host_token` 不一致で公開範囲変更 |
| `404` | 不明 | 存在しない `room_id` |
| `410` | 期限切れ | TTL を過ぎたルーム |
| `422` | 入力不正 | `name` が21文字以上、`lat` が範囲外 など |

### 制限・定数(`apps/server/app/config.py`、環境変数 `IMASOKO_*` で上書き可)

| 定数 | 既定 | 用途 |
|---|---|---|
| `end_offset_seconds` | `10800`(3時間) | 集合時間(`meet_at`)からの有効期限オフセット。`expires_at = meet_at + end_offset_seconds`。**front `END_OFFSET` と一致**(issue #4, [06 §2](./06_implementation-status.md)) |
| `room_id_bytes` | `8` | `secrets.token_urlsafe(8)` → 11文字程度の推測困難ID |
| `host_token_bytes` | `16` | `host_token` のエントロピー |
| `max_members_per_room` | `50` | 超過 join は満員拒否 |
| `max_name_length` | `20` | 表示名の最大長 |
| `cleanup_interval_seconds` | `60` | 期限切れ掃除タスクの間隔 |

---

## 1. REST API

### 1.1 `POST /api/rooms` — ルーム作成

ルームを作成し、`room_id` と `host_token` を払い出す。

**リクエスト**(body は任意。省略時は private・無題・集合時間=作成時刻)

```jsonc
{
  "title": "サッカー部 集合",              // 任意。公開一覧の表示名
  "visibility": "private",                  // 任意。"private"(既定) | "public"
  "meet_at": "2026-07-04T18:00:00+00:00"    // 任意。集合時間(ISO 8601)。省略時は作成時刻とみなす
}
```

**レスポンス `200`**(`expires_at` = `meet_at` + 3h, issue #4)

```json
{
  "room_id": "XV1G7Y-_rDI",
  "host_token": "KqSOHpWqoU21WVYx_ycstQ",
  "meet_at": "2026-07-04T18:00:00+00:00",
  "expires_at": "2026-07-04T21:00:00+00:00",
  "visibility": "private"
}
```

**curl 例**

```bash
curl -X POST http://localhost:8000/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"title":"サッカー部 集合","visibility":"private"}'
```

- `host_token` は**このレスポンスでしか返らない**。クライアントは `localStorage`(キー例 `imasoko.host.<room_id>`)へ保存する([design/01](./design/01_top.md))。URLには含めない。

---

### 1.2 `GET /api/rooms/{room_id}` — 存在・期限チェック

参加フォーム表示前のチェックに使う。

**レスポンス `200`**

```json
{ "status": "active", "expires_at": "2026-07-04T03:42:20.614529+00:00", "visibility": "public" }
```

- `visibility`(`private` / `public`):ルームの公開範囲。退出→公開一覧から再参加した際に、クライアントがサーバー保持値から公開範囲を復元するために返す(issue #35)。

**エラー**

| 状況 | コード | body |
|---|---|---|
| 存在しない | `404` | `{"detail":"not found"}` |
| 期限切れ | `410` | `{"detail":"gone"}` |

**curl 例**

```bash
curl -i http://localhost:8000/api/rooms/XV1G7Y-_rDI
# HTTP/1.1 200 OK … {"status":"active","expires_at":"…","visibility":"private"}

curl -i http://localhost:8000/api/rooms/unknown
# HTTP/1.1 404 Not Found … {"detail":"not found"}
```

---

### 1.3 `GET /api/rooms/public` — 公開ルーム一覧

`public` かつ有効なルームのみを返す(**private・期限切れは除外**)。位置など機微情報は含めない。

**レスポンス `200`**

```json
[
  {
    "room_id": "XV1G7Y-_rDI",
    "title": "サッカー部 集合",
    "members": 5,
    "expires_at": "2026-07-04T03:42:20.614529+00:00"
  }
]
```

- `title` 未設定のルームは `"無名のルーム"` を返す。
- `members` は現在の参加人数。
- 公開ルームが無ければ `[]`。

**curl 例**

```bash
curl http://localhost:8000/api/rooms/public
```

---

### 1.4 `PATCH /api/rooms/{room_id}/visibility` — 公開範囲の切替(host のみ)

「全員の現在地を不特定多数に晒す」変更のため、**`host_token` 必須**([05 §3](./05_feature-design.md))。

**リクエスト**

```
Header: x-host-token: KqSOHpWqoU21WVYx_ycstQ
```
```jsonc
{
  "visibility": "public",         // "private" | "public"
  "title": "サッカー部 集合"       // 任意。公開一覧の表示名を同時更新
}
```

**レスポンス `200`**

```json
{ "visibility": "public" }
```

**エラー**

| 状況 | コード | body |
|---|---|---|
| ルーム不明 / 期限切れ | `404` | `{"detail":"not found"}` |
| `host_token` 不一致・欠落 | `403` | `{"detail":"forbidden"}` |

**curl 例**

```bash
curl -X PATCH http://localhost:8000/api/rooms/XV1G7Y-_rDI/visibility \
  -H 'Content-Type: application/json' \
  -H 'x-host-token: KqSOHpWqoU21WVYx_ycstQ' \
  -d '{"visibility":"public","title":"サッカー部 集合"}'
```

---

### 1.5 `GET /api/campus` — キャンパスマスタ

エリア一覧 + 建物/階/教室 + 空き教室CSV を返す(front/back で単一ソース、[05 §2/§5](./05_feature-design.md))。

**レスポンス `200`(抜粋)**

```jsonc
{
  "areas": [
    { "id": "station_1", "name": "国際展示場駅" },
    { "id": "station_2", "name": "東京テレポート駅" },
    { "id": "campus",    "name": "有明キャンパス" }
  ],
  "buildings": [
    {
      "id": "b1",
      "name": "1号館",
      "svgRegionId": "region-b1",
      "spots": [
        { "id": "b1-front", "label": "1号館前", "area": "campus", "lat": 0, "lng": 0 }
      ],
      "floors": [
        { "level": "3F", "rooms": [ { "id": "b1-301", "name": "301" } ] }
      ]
    }
  ],
  "classrooms": [
    { "building_id": "b1", "floor": "2F", "room_id": "b1-201",
      "name": "201", "capacity": 40, "date": "2026-07-09",
      "available": [
        { "start": "00:00", "end": "08:50" },
        { "start": "10:30", "end": "13:10" }
      ] }
  ]
}
```

**curl 例**

```bash
curl http://localhost:8000/api/campus
```

> `classrooms[]` は `classrooms.csv`(MUSCAT 手動エクスポートから生成, [05 §5](./05_feature-design.md))由来。`capacity` は数値、`available` は空き時間帯の配列(`date` = エクスポート対象日)。**データの差し替え点は `apps/server/app/campus.py` の `load_campus()` 1関数**に閉じている。

---

## 2. WebSocket API

エンドポイント:**`/ws/{room_id}`**(開発時 `ws://localhost:8000/ws/...`、本番 `wss://`)。
すべてのメッセージは JSON で、**`type` フィールドで種別を判別**する。

### 2.1 接続フロー

```
1. クライアントが /ws/{room_id} に接続
2. クライアントは最初に必ず {"type":"join", ...} を送る
3. サーバーは参加者IDを発行し、本人に room_state(全員の現在状態)を返す
4. 他の参加者へ member_joined をブロードキャスト
5. 以降、position / floor / meeting_point / add_place_suggestion / leave をやり取り
```

### 2.2 接続時のエラー / 特殊応答

| 状況 | サーバーの挙動 |
|---|---|
| ルームが存在しない / 期限切れ | `{"type":"room_expired"}` を送って切断 |
| 最初のメッセージが `join` でない / 不正JSON | 何も返さず切断 |
| 満員(`max_members_per_room` 超過) | `{"type":"room_full"}` を送って切断 |
| ルーム中に不正メッセージ受信 | **無視して継続**(1クライアントの不正で全体を落とさない, [02 §5](./02_technical-design.md)) |
| TTL 到達(掃除タスク) | 全員へ `{"type":"room_expired"}` → 全接続を切断 → ルーム削除 |

---

### 2.3 クライアント → サーバー

#### `join`(接続後、最初に必ず送る)

```json
{ "type": "join", "name": "たくま", "building_id": null, "floor": null }
```

- `name`:1〜20文字(必須)。屋内にいるなら `building_id`(建物id)+ `floor`(例 `"3F"`)を付ける。屋外・未設定は `null`。

#### `position`(位置更新)

```json
{ "type": "position", "lat": 35.6581, "lng": 139.5432, "accuracy": 12.0 }
```

- `lat`:-90〜90、`lng`:-180〜180(範囲外は 422 相当でパース失敗 → 無視)。`accuracy` は任意。
- クライアントは `watchPosition` から送るが、**最短間隔でスロットリング**(案:2秒 / 5m, [02 §2](./02_technical-design.md))。

#### `floor`(建物・階の自己申告変更)

```json
{ "type": "floor", "building_id": "b1", "floor": "3F" }
```

- 屋外/解除は `{ "type":"floor", "building_id": null, "floor": null }`。

#### `meeting_point`(集合場所の設定・解除。誰でも可)

```jsonc
// 座標
{ "type": "meeting_point",
  "point": { "kind": "coords", "area": "campus", "lat": 35.6579, "lng": 139.5440 } }

// メンバー追従(その人の現在地に集合地点が追従)
{ "type": "meeting_point", "point": { "kind": "member", "memberId": "a1b2c3d4" } }

// 場所(教室 or ランドマーク)
{ "type": "meeting_point",
  "point": { "kind": "place", "place": { "type": "classroom", "roomId": "b1-301" } } }
{ "type": "meeting_point",
  "point": { "kind": "place", "place": { "type": "building_spot", "spotId": "b1-front" } } }

// 解除
{ "type": "meeting_point", "point": null }
```

#### `add_place_suggestion`(空き教室候補の追加。誰でも可)

```json
{ "type": "add_place_suggestion",
  "place": { "type": "classroom", "roomId": "b1-305" },
  "note": "3Fの奥、空いてた" }
```

#### `leave`(明示退出)

```json
{ "type": "leave" }
```

- 受信するとサーバーは接続を閉じ、他の参加者へ `member_left` を送る(切断でも同じ)。

---

### 2.4 サーバー → クライアント

#### `room_state`(join 直後に本人へ)

```json
{
  "type": "room_state",
  "self_id": "a1b2c3d4",
  "members": [
    { "id": "a1b2c3d4", "name": "たくま", "building_id": null, "floor": null,
      "lat": null, "lng": null, "updated_at": "2026-07-04T03:10:00+00:00" }
  ],
  "meeting_point": null,
  "expires_at": "2026-07-04T03:42:20.614529+00:00"
}
```

#### `member_joined` / `member_update` / `member_left`

```json
{ "type": "member_joined", "member": { "id": "e5f6", "name": "さき", "building_id": "b1", "floor": "3F", "lat": null, "lng": null, "updated_at": "…" } }
{ "type": "member_update", "member": { "id": "a1b2c3d4", "name": "たくま", "building_id": null, "floor": null, "lat": 35.6581, "lng": 139.5432, "updated_at": "…" } }
{ "type": "member_left", "id": "a1b2c3d4" }
```

- `position` / `floor` を受けたサーバーは、更新後の member を `member_update` で**全員(本人含む)へ**ブロードキャストする。

#### `meeting_point`(全員へ反映。`point` は 2.3 の union か `null`)

```json
{ "type": "meeting_point", "point": { "kind": "coords", "area": "campus", "lat": 35.6579, "lng": 139.5440 } }
```

- `member` 型は座標を再送しない。クライアントは対象の `member_update` を見て**UI側で追従表示**する。

#### `place_suggestions`(候補一覧の更新)

```json
{
  "type": "place_suggestions",
  "items": [
    { "id": "3f9c1a2b", "place": { "type": "classroom", "roomId": "b1-305" },
      "note": "3Fの奥、空いてた", "addedBy": "e5f6", "createdAt": "2026-07-04T03:15:00+00:00" }
  ]
}
```

#### `room_expired`

```json
{ "type": "room_expired" }
```

- 受信後、クライアントは**終了表示に切り替え、再接続しない**([08 states](./design/08_states-and-errors.md))。

---

### 2.5 手で試す(websocat / wscat)

```bash
# 1) ルーム作成
RID=$(curl -s -X POST localhost:8000/api/rooms -H 'Content-Type: application/json' -d '{}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["room_id"])')

# 2) 接続して join(websocat の場合)
websocat ws://localhost:8000/ws/$RID
# 接続後に手入力で送る:
{"type":"join","name":"たくま","building_id":null,"floor":null}
# → room_state が返る
{"type":"position","lat":35.6581,"lng":139.5432}
# → member_update が返る
```

---

## 3. データ型(ワイヤ契約)

TS: `apps/web/src/types/messages.ts` / Py: `apps/server/app/models.py`。

```ts
type Visibility = "private" | "public";

interface MemberState {
  id: string;
  name: string;
  building_id: string | null;
  floor: string | null;       // 例 "3F"
  lat: number | null;
  lng: number | null;
  updated_at: string;         // ISO 8601
}

type PlaceRef =
  | { type: "classroom";     roomId: string }
  | { type: "building_spot"; spotId: string };

type MeetingPoint =
  | { kind: "coords"; area: AreaId; lat: number; lng: number }
  | { kind: "member"; memberId: string }
  | { kind: "place";  place: PlaceRef };

interface PlaceSuggestion {
  id: string;
  place: PlaceRef;
  note: string;
  addedBy: string;            // memberId
  createdAt: string;          // ISO 8601
}
```

> **注意(フロント内部表現との違い)**:フロントは `apps/web/src/types/campus.ts` で `MeetingPoint` を**ワールド座標 x/y**ベースで持つ(地図描画用。実地理 GeoJSON を投影した座標系)。**API のワイヤ契約は本ドキュメント(lat/lng・`roomId`/`spotId`)が正**。実配線時はフロント内部表現 ⇄ ワイヤ契約の変換を入れる([06 §2](./06_implementation-status.md))。
>
> **型識別子の対応**:上記ワイヤ型は Python `models.py` の識別子(`MeetingPoint` / `PlaceSuggestion`)に一致。TS `messages.ts` 側は集合場所の受信メッセージが `MeetingPointMsg`、`place_suggestions.items` は現状 `unknown[]`(緩い型)で、厳密な `PlaceSuggestion` 型はサーバー(`models.py`)側のみが持つ。

---

## 4. 実装対応表

> ルーティングは `create_app()`(`app/main.py`)が `app/routes/*` の APIRouter を `include_router` する構成(#92 / PR #114 でリファクタ)。

| API | サーバー実装 | web 型/呼び出し |
|---|---|---|
| `POST /api/rooms` | `app/routes/rooms.py` `create_room` / `app/rooms.py` | `lib/api.ts` `createRoom` |
| `GET /api/rooms/{id}` | `app/routes/rooms.py` `room_status` | `lib/api.ts` `getRoom` |
| `GET /api/rooms/public` | `app/routes/rooms.py` `public_rooms` / `rooms.list_public` | `lib/api.ts` `getPublicRooms` |
| `PATCH …/visibility` | `app/routes/rooms.py` `patch_visibility` / `rooms.set_visibility` | `lib/api.ts` `patchVisibility` |
| `GET /api/campus` | `app/routes/campus.py` / `app/campus.py` | `lib/api.ts` `getCampus` |
| `GET /api/config` · `GET /api/health` | `app/routes/meta.py`(health は `status` に加え稼働状況 `active_rooms` / `total_members` を返す。issue #10) | — |
| `WS /ws/{id}` | `app/routes/ws.py` `ws_endpoint` / `app/handlers.py`(`establish_join`/`handle`/`cleanup_on_disconnect`)/ `app/ws.py` | `hooks/useRoomSocket.ts` |

---

## 5. 注意点

- **位置履歴は残さない**:サーバーは最新値のみ保持(プライバシー, [企画書 §8](./imasoko-kikakusho.md))。ログにも座標を出さない([02 §9](./02_technical-design.md))。
- **有効期限モデル**:✅ **統一済み(issue #4)**。サーバー・フロントとも「集合時間(`meet_at`)+ 3h」。`POST /api/rooms` の任意 `meet_at`(省略時は作成時刻)を起点に `expires_at = meet_at + end_offset_seconds`([06 §2](./06_implementation-status.md))。
- **単一ワーカー**:ルーム状態はインメモリのため `uvicorn --workers` を増やすと壊れる。将来は Redis pub/sub 等([02 §9](./02_technical-design.md))。
