# 画面設計 索引(いまそこ)

各画面/パネルの詳細設計。**モバイルファースト**(スマホ縦を基準、PCは中央寄せ・最大幅で表示)。
機能の一次資料は [企画書](../imasoko-kikakusho.md) / [dev-docs](../imasoko-dev-docs.md) / [05 機能・データ設計](../05_feature-design.md)。本設計はそれらと**齟齬なく**対応させる(下部の機能↔画面 対応表を参照)。

## 画面/パネル一覧

| # | 画面/パネル | 表示 | 主コンポーネント | doc |
|---|---|---|---|---|
| 01 | トップ | `/` | `TopPage` | [01_top](./01_top.md) |
| 02 | 公開ルーム一覧 | `/public` | `PublicRoomsPage` | [02_public-rooms](./02_public-rooms.md) |
| 03 | 参加フォーム | `/r/:id`(未参加) | `JoinForm` | [03_join](./03_join.md) |
| 04 | ルームメイン(地図) | `/r/:id`(参加後) | `MapView` `AreaSwitcher` `MemberList` `FloorSelector` | [04_room-map](./04_room-map.md) |
| 05 | 建物ドリルダウン(シート) | 地図に重畳 | `CampusView` | [05_building-panel](./05_building-panel.md) |
| 06 | 集合場所 & 空き教室(シート) | 地図に重畳 | `MeetingPointPicker` `PlaceSuggestions` | [06_meeting-and-places](./06_meeting-and-places.md) |
| 07 | 共有・公開設定・退出(シート) | 地図に重畳 | `ShareButton` `RoomVisibility` | [07_room-settings](./07_room-settings.md) |
| 08 | 例外状態 | オーバーレイ/全画面 | — | [08_states-and-errors](./08_states-and-errors.md) |

ルートは `/` `/public` `/r/:id` の3つのみ(SPA)。ルーム内機能は**地図に重ねるボトムシート**で出す(サブルートにしない)。

## 画面遷移図

```
 /  トップ ──[ルームを作る]──▶ POST /api/rooms ──▶ /r/:id (host, 参加フォーム→地図)
    └──[公開ルームを探す]──▶ /public ──[カードをタップ]──▶ /r/:id (参加フォーム→地図)

 /r/:id  参加前チェック(GET /api/rooms/:id)
    ├─ active ──▶ 参加フォーム ──[参加]──────▶ 地図(メイン)
    │                          └[位置を拒否]──▶ 地図(閲覧のみ)
    ├─ 410 期限切れ ──▶ 終了状態(08)
    └─ 404 不明 ──────▶ Not Found(08)

 地図(メイン)
    ├─ 下部バー ──▶ ボトムシート:集合場所/建物/空き教室/共有/設定(1枚ずつ)
    ├─ [退出] ──▶ leave 送信 ──▶ トップ
    └─ room_expired 受信 ──▶ 終了状態(08)
```

## 共通ルール

- **レイアウト**:地図が主役。ルーム画面は「上部=エリア切替+残り時間」「中央=地図」「右下=地図FAB」「下部=操作バー+メンバーハンドル」。
- **ボトムシート規約**:同時に開くのは1枚。ハンドルのドラッグ/背景タップで閉じる。`BottomSheet.tsx`(汎用)で統一。
- **ピン/色**([企画書 4.3](../imasoko-kikakusho.md)):自分=強調色、他人=名前+階、集合地点=別形状、**圏外=グレーでマップ端にクランプ+「圏外」ラベル**([dev-docs §7](../imasoko-dev-docs.md))。
- **階の表示**:`building_id + floor`。屋内で建物を選んだ人は「たくま 1号館3F」、未設定は「たくま」。
- **位置更新**:`watchPosition` → スロットリング(2秒 / 5m, [02 §2](../02_technical-design.md))で `position` 送信。受信は `member_update`。
- **接続**:WS切断は指数バックオフで再接続し `join` 再送([02 §5](../02_technical-design.md))。`room_expired` 後は再接続しない。
- **プライバシー**:名前はReactが自動エスケープ(XSS対策)。位置は最新値のみ、履歴なし。public化は警告を出す。
- **文言**:日本語。ローディング/エラーはトースト。

## 機能 ↔ 画面 対応表(齟齬防止)

| 機能(出典) | 画面/パネル |
|---|---|
| ルーム作成([企画書 4.1](../imasoko-kikakusho.md)) | 01 トップ |
| 公開/非公開の切替([05 §3](../05_feature-design.md)) | 07 設定(host) |
| 公開ルームの発見([05 §3](../05_feature-design.md)) | 02 公開ルーム一覧 |
| 参加=名前/階数/位置許可([企画書 4.2](../imasoko-kikakusho.md)) | 03 参加フォーム |
| 3エリア切替([05 §1](../05_feature-design.md)) | 04 地図(上部) |
| リアルタイム地図・ピン([企画書 4.3](../imasoko-kikakusho.md)) | 04 地図 |
| 圏外表示([dev-docs §7](../imasoko-dev-docs.md)) | 04 地図 / メンバー一覧 |
| 建物→階→教室 + 階ごとメンバー([05 §2](../05_feature-design.md)) | 05 建物パネル |
| 集合場所3タイプ([05 §4](../05_feature-design.md)) | 06 集合場所 |
| 空き教室のユーザー追加([05 §4/§5](../05_feature-design.md)) | 06 空き教室候補 |
| 共有([企画書 4.1](../imasoko-kikakusho.md)) | 07 共有 |
| 途中退出([05 §0](../05_feature-design.md)) | 07 退出 |
| 有効期限(既定2h)([企画書 4.5](../imasoko-kikakusho.md)) | 04 残り時間 / 08 終了状態 |
