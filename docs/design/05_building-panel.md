# 05 建物ドリルダウン(ボトムシート)

関連:[索引](./00_index.md) / [05 §2](../05_feature-design.md) / [dev-docs §6](../imasoko-dev-docs.md)

## 目的

キャンパスエリアで**建物(1号館…)→ 階 → 教室**を確認し、さらに**各階に「その階にいる」と自己申告したメンバー**を表示して、屋内での合流を助ける。GPSでは屋内位置を取れないため、屋内メンバーは**自己申告の建物+階**でまとめる。

## 遷移

- 入口:操作バー[建物] / 地図上の建物クリック(`svgRegionId`)。**キャンパスエリアのときのみ**
- 出口:ハンドルのドラッグ / 背景タップ / [閉じる]

## レイアウト(mobile・シート)

```
╭─────── ハンドル ───────╮
│ 建物  [1号館▾]         │  ← 建物選択(タブ/プルダウン)
├───────────────────────┤
│ ▼ 3F      たくま・ゆうた │  ← その階を自己申告している人
│     301  302  303      │  ← 教室
│ ▶ 2F                   │
│ ▶ 1F      さき          │
├───────────────────────┤
│ [ここを集合場所にする ▾] │  ← 教室/「1号館前」を集合場所へ(06)
╰───────────────────────╯
```

## 要素と挙動

| 要素 | 挙動 |
|---|---|
| 建物選択 | `GET /api/campus` の `buildings` から選ぶ。地図クリック(`svgRegionId`↔`building.id`)と同期 |
| 階アコーディオン | 各階に教室(`rooms`)を表示。開閉可 |
| **階ごとメンバー** | `room_state` の members のうち `building_id == 選択建物` かつ `floor == その階` の人を名前表示。`member_update`(建物/階変更)で追従 |
| 教室 / ランドマーク | 教室や「1号館前」を**集合場所に採用**([06](./06_meeting-and-places.md) の `place`)、または**空き教室候補に追加** |
| 自分をここにする | 選んだ建物+階を自分の `floor` として送信(`FloorSelector` と同じ `floor` メッセージ) |

> **モデル前提(齟齬解消済み)**:階ごとにメンバーを出すため、階の自己申告は `floor="3F"` だけでなく `building_id` を持つ。`floor` メッセージ/メンバー状態に `building_id` を追加済み([dev-docs §6](../imasoko-dev-docs.md) / [02 §4](../02_technical-design.md))。屋外・未設定は `building_id=null`。

## API / WS

```
GET /api/campus   → { areas, buildings }   # buildings[].floors[].rooms[], spots(ランドマーク)
WS 送信 floor      → { type:"floor", building_id, floor }
WS 受信 member_*   → building_id/floor を含む member で階ごと表示を更新
```

## 状態・エラー

- 駅エリアで開こうとした場合:[建物]は無効(押せない)
- `GET /api/campus` 失敗:シートに再取得ボタン
- 建物マスタ未整備:教室が無い建物は「準備中」表示(`buildings.json` は手入力, [05 §5](../05_feature-design.md))

## TODO・未決定

- [ ] `buildings.json` の建物・階・教室・`svgRegionId`・ランドマークの入力
- [ ] 「自分をここにする」を建物パネルに置くか `FloorSelector` に集約するか
- [ ] 同じ階に多人数いる場合の省略表示
