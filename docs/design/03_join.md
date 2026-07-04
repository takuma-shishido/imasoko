# 03 参加フォーム `/r/:roomId`(未参加)

関連:[索引](./00_index.md) / [企画書 4.2](../imasoko-kikakusho.md) / [dev-docs §6](../imasoko-dev-docs.md) / [02 §5](../02_technical-design.md)

## 目的

共有URLを開いた人が、**名前(+任意で建物・階)を入力し位置情報を許可して参加**する。所要数十秒、入力は名前1項目を基本とする([企画書 4.2](../imasoko-kikakusho.md))。

## 遷移

- 入口:共有URL `/r/:id` を開く / 公開一覧([02](./02_public-rooms.md))からのタップ / 作成直後(host)
- **表示前チェック**:`GET /api/rooms/:id` で存在・期限を確認
  - `active` → 本フォーム
  - `410 Gone`(期限切れ)→ [08 終了状態](./08_states-and-errors.md)
  - `404` → [08 Not Found](./08_states-and-errors.md)
- 出口:[参加する] → [04 地図](./04_room-map.md)

## レイアウト(mobile)

```
┌───────────────────────┐
│  ○○ルーム ・ 残り 1:58  │
│                       │
│  表示名               │
│  ┌─────────────────┐  │  ← 必須, 1〜20文字
│  │ たくま            │  │
│  └─────────────────┘  │
│  いる場所(任意)        │
│  [建物 ▾] [階 ▾]       │  ← 未設定でOK(屋外なら不要)
│                       │
│  📍 位置情報を許可すると  │
│     地図に自分が出ます    │
│  ┌─────────────────┐  │
│  │   参加する        │  │
│  └─────────────────┘  │
│  位置なしで見るだけ参加 → │  ← 閲覧のみ
└───────────────────────┘
```

## 要素と挙動

| 要素 | 挙動 |
|---|---|
| 表示名 | 必須。1〜20文字、空白のみ不可([02 §7](../02_technical-design.md))。ニックネーム可 |
| 建物 / 階(任意) | `GET /api/campus` の建物・階から選択。未設定は `null`。屋内にいる人向け(`FloorSelector` と同一UI) |
| **[参加する]** | WS `/ws/:id` に接続 → `join`(`name`/`building_id`/`floor`)送信 → `room_state` 受信で参加完了 → 地図へ |
| 位置許可 | 参加時に `watchPosition` 開始。**許可**→ `position` を送信(スロットリング, [02 §2](../02_technical-design.md))。**拒否**→「閲覧のみ」モード(`position` を送らず受信だけ, [02 §5](../02_technical-design.md)) |
| [閲覧のみ] | 位置を出さず参加(はぐれた側だけ位置を出したいケース, [企画書 4.2](../imasoko-kikakusho.md)) |

## API / WS

```
GET /api/rooms/:id      → { status, expires_at }            # 表示前チェック
WS  join                → { type:"join", name, building_id, floor }
WS  受信 room_state      → { self_id, members, meeting_point, place_suggestions, expires_at }
```

## 状態・エラー

- WS接続失敗:再接続(指数バックオフ, [02 §5](../02_technical-design.md))。数回失敗で「接続できません」表示+再試行
- 位置許可ダイアログ拒否:閲覧のみバッジを付けて続行。後から許可し直せる導線を用意
- 名前未入力:[参加する]を無効化
- 期限切れ/不明:[08](./08_states-and-errors.md)へ

## TODO・未決定

- [ ] 前回の表示名を端末に保存して初期表示するか
- [ ] 建物/階セレクタを参加フォームに出すか、参加後にまとめるか(参加を軽くするなら任意のまま最小表示)
- [ ] 「閲覧のみ」からの位置許可し直し導線の置き場
