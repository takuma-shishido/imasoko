# 08 複数ファイル横断実装マップ(認知負荷の観点)

最終更新:2026-07-08

「1つの機能・値の流れを理解するのに複数ファイルを辿る必要がある」箇所をコードベース全体(web / server)から洗い出した一覧。
複数ファイル横断は人間の認知負荷の観点で好ましくないため、**どこで・何ファイル跨ぐか・なぜそうなっているか・畳めるか**を記録し、リファクタ判断の材料とする。

> 前提:2026-07-06 の構造リファクタ(親 Issue #87/#88、PR #109〜#128)は「god class の分割」を目的に**意図的に**ファイルを分けた。本書はその結果を認知負荷の側から棚卸しするもので、「分割 = 悪」ではない。**変換・判断を伴わない純転送の層**が挟まっているものを重点的に挙げる。

## 判定基準

- **対象**:1つの操作・値を読解するのに 3 ファイル以上を行き来し、かつ途中の層がロジックを足していない(純転送・素通し再掲・別名)もの。
- **対象外**:純粋なユーティリティの再利用(`lib/format.ts`・`lib/chipColors.ts` 等)、型 import、責務が明確に異なる層(API クライアント等)。

## 一覧(サマリ)

| # | 対象 | 経路(ファイル数) | 純転送層 | 由来 | 改善余地 |
|---|---|---|---|---|---|
| W1 | 地図ジェスチャ | 4 | engine の転送12メソッド | #103 | ★ 畳める |
| W2 | シート開閉・ドラッグ | 4 | engine の転送5メソッド + open系別名 | #104 | ★ 畳める |
| W3 | 描画派生値(v.*) | 3〜4 | selector の素通しキー 57 個 | #100〜102 | 設計そのもの(維持) |
| W4 | WS 送受信の値の流れ | 5 | — (各層に実ロジックあり) | #1 | 維持 |
| W5 | 実位置(GPS)の流れ | 4 | — (各層に実ロジックあり) | #2 | 維持 |
| W6 | サーバー設定値(可変モジュール状態) | 4 | constants.ts の再輸出 | #15 | 注意書きで対応 |
| W7 | キャンパスマスタ(可変モジュール状態) | 4 | 同上パターン | #14 | 注意書きで対応 |
| W8 | Controller への deps 注入 | 2(双方向) | — | #103/#104 | 維持 |
| W9 | `floorsOf` の二重保持 | 2 | 同一実装 ×2 | #102 で意図的に決定 | 維持(決定済み) |
| C1 | WS/REST 型契約の二重定義 | 3(web/server 跨ぎ) | — | docs/02 §4 のルール | 維持(契約) |
| S1 | WS 1メッセージの処理 | 5 | — (各層に実ロジックあり) | #95 | 維持 |
| S2 | 有効期限モデル | 4+(web/server 跨ぎ) | — | #4/#15 | 維持(統一済み) |

★ = 挙動不変のまま層を減らせる(本書末尾「畳み込み案」参照)。

---

## Web

### W1. 地図ジェスチャ(パン/ピンチ/ホイール/FAB)— 4ファイル・うち2層が純転送

```
MapGestureController.ts   実装(唯一ロジックがある層)
  → RoomEngine.ts         純転送メソッド ×12(onMapDown/Move/Up/Cancel/Wheel,
                          fabZoomIn/Out/Self/Fit, fitArea, centerOn, pickArea)
  → selectors/mapVals.ts  素通しキー再掲(onMapDown: engine.onMapDown, …)
  → MapView.tsx ほか      v.onMapDown として消費
```

- RoomEngine 側はコメントに「公開名維持のための委譲(issue #103)」と明記されたリファクタ時の足場。転送12個のうち engine 内部からも呼ばれるのは `fitArea`(2箇所)だけで、**残り11個は selector に再輸出されるためだけに存在**する。
- 1つのジェスチャの挙動を確認するには最悪4ファイルを開く必要がある。

### W2. シート開閉アニメ・ハンドルドラッグ — 4ファイル・うち2層が純転送

```
SheetController.ts        実装(開閉アニメ・ドラッグ・退場タイマー)
  → RoomEngine.ts         純転送 ×5(closeSheet, hDown/hMove/hUp/hCancel)
                          + openSheet ラッパと open系メソッド群
  → selectors/sheetVals.ts 素通しキー再掲
  → BottomSheet.tsx / RoomSheets.tsx
```

- W1 と同型(issue #104 の「公開名維持のための委譲」)。
- 付随して `openPlaces` は `openMeeting` と完全に同一実体(どちらも meeting シートを開くだけ)の**別名**で、読み手に「別のシートがあるのか」と誤解させる。

### W3. 描画派生値(`v.*`)— 3〜4ファイル(ただし設計そのもの)

```
RoomEngine.ts(state)
  → selectors/{topVals,mapVals,sheetVals}.ts(派生値の計算)
  → RoomContext.tsx(renderVals() を Provider で配布)
  → components/*(v.<key> で消費)
```

- selector 3ファイルには `key: engine.<key>` の**素通し再掲キーが計57個**あるが、これは「コンポーネントは flat な `v.*` 契約だけに依存し engine 内部に触れない」という issue #100〜102 の設計の実体であり、削るとアーキテクチャが変わる。**維持**。
- 認知負荷の実態:「この表示値はどこで決まるか」を追うには component → selector → engine(state 更新箇所)の3ホップが常に必要。これは仕組み上のコストとして受け入れる(仕組みの説明は docs/06 参照)。

### W4. WS 送受信の値の流れ — 5ファイル(各層に実ロジックあり)

```
受信: server → hooks/useRoomSocket.ts(接続・再接続バックオフ)
       → state/RoomContext.tsx(接続条件の判定と配線)
       → RoomEngine.onServerMsg(メッセージ別ハンドラ)
       → lib/wire.ts(ワイヤ契約 ⇔ 内部表現の変換)
       → state 反映
送信: engine.send → socketSend(RoomContext が注入)→ useRoomSocket
```

- 5ファイル跨ぐが、各層に固有の責務(再接続 / React ライフサイクル / 状態機械 / 座標変換)があり純転送層はない。**維持**。
- 読解の起点は `RoomContext.tsx`(25〜40行目)に集約されており、ここが配線図の役割を果たす。

### W5. 実位置(GPS)の流れ — 4ファイル(各層に実ロジックあり)

```
hooks/useGeolocation.ts(watchPosition)
  → RoomContext.tsx(有効条件 geoEnabled の判定・配線)
  → RoomEngine.onGeoPosition(throttle 2秒/5m・自分ピン反映)
  → lib/wire.ts locate()(lat/lng → エリア + px)
```

- W4 と同様に各層が実ロジックを持つ。**維持**。

### W6. サーバー設定値 — 4ファイル + 可変モジュール状態

```
server config.py → GET /api/config → lib/api.ts
  → RoomEngine.loadConfig() → lib/constants.ts setServerConfig()
  → 読み手(topVals / RoomEngine)は serverConfig.<key> を参照
```

- `constants.ts` の `serverConfig` は **export された可変オブジェクト**(参照は不変で中身を差し替える)。「定数ファイルなのに実行時に変わる値がある」ことと、「フォールバック定数(`END_OFFSET` 等)と実効値(`serverConfig.endOffsetMs`)の二層構造」は初見で気づきにくい。
- 二重管理の解消(issue #15)という目的は妥当なので構造は維持し、**読み手が誤解しないことをコメントで担保**する(現状 constants.ts にコメントあり)。

### W7. キャンパスマスタ — 4ファイル + 可変モジュール状態

```
server campus.py → GET /api/campus → lib/api.ts
  → RoomEngine.loadCampus() → lib/campusData.ts setBuildings()
  → 読み手は BUILDINGS / bById() 等を参照
```

- W6 と同一パターン(`export const BUILDINGS` の中身を実行時に差し替え)。フォールバック定義(ハードコード)と実効値の二層も同じ。**維持 + コメント担保**(現状あり)。

### W8. Controller への deps 注入 — 2ファイル双方向参照

- `MapGestureController` / `SheetController` / `RoomSocketHandler`(#164)/ `MeetingModel` / `RoomSession`(#173)は `getState` / `setState` / `toast` 等をコールバックで注入され、実質 RoomEngine の内部状態を双方向に読む。Controller 単体では完結して読めず、**常に RoomEngine とペアで読む**必要がある。
- god class 分割(#103/#104/#164/#173)の対価であり、注入 interface(`MapGestureDeps` / `SheetDeps` / `RoomSocketDeps` / `MeetingDeps` / `RoomSessionDeps`)が境界を型で明示しているため許容。**維持**。

### W9. `floorsOf` の二重保持 — 2ファイルに同一実装

- `selectors/topVals.ts` と `selectors/sheetVals.ts` が同じ `floorsOf`(建物 id → フロア選択肢)を各自保持。
- issue #102 で「役割(join vs members/building シート)が別のため各所保持」と**明示的に決定済み**(topVals.ts 冒頭コメント)。**維持**。

## Web ⇔ Server 共通

### C1. WS/REST 型契約の二重定義 — 3ファイル(意図的な契約)

```
web types/messages.ts ⇔ server app/models.py(同一契約の二重定義)
  + web lib/wire.ts(ワイヤ契約 ⇔ 内部表現の変換コーデック)
```

- 言語を跨ぐため二重定義は避けられず、CLAUDE.md / docs/02 §4 の「**同じ PR で両方更新**」ルールで同期を担保している。`wire.ts` の `meetingFromWire` / `meetingToWire` は対称な逆変換の対で、構造が酷似して見えるが統合すると判別共用体の網羅チェックが失われる。**維持**。

## Server

### S1. WS 1メッセージの処理 — 5ファイル(各層に実ロジックあり)

```
routes/ws.py(エンドポイント:accept → join → 受信ループ → cleanup)
  → handlers.py(メッセージ別の処理本体)
  → rooms.py(ルーム・メンバー状態)
  → ws.py(ConnectionManager:接続保持・broadcast)
  → models.py(型契約)
```

- 5ファイル跨ぐが、route は「薄いオーケストレーションに留める」と明記されており(#95)、各ファイルの責務が明確で純転送層はない。総行数も小さい(routes/ws.py 36行・ws.py 39行)。**維持**。

### S2. 有効期限モデル — web/server 跨ぎ + 複数ファイル

```
server config.py(end_offset_seconds)
  → rooms.py is_expired() / expiry.py cleanup_loop()
  → GET /api/config → web constants.ts(serverConfig.endOffsetMs)
  → RoomEngine(クロックで screen 遷移)
```

- 「集合時間 + 3時間」の1つのモデルが web/server 双方の複数ファイルに現れるが、issue #4 で統一・#15 で二重管理を解消済みであり、値の源泉は server config の1箇所。**維持**。

---

## 畳み込み案(★ の2件)

W1/W2 の「RoomEngine 上の純転送層」は、呼び手が selector のみ(テストからの直接呼び出しなし)のため、**挙動不変のまま削除可能**:

1. `gesture` / `sheetCtl` を selector から参照できるようにし(`readonly` 公開)、`mapVals` / `sheetVals` が `engine.gesture.onMapDown` 等を直接再掲する。`v.*` のキー集合は不変。
2. `openPlaces` 別名は `mapVals` 側で `openPlaces: engine.openMeeting` に差し替えて engine 側の別名メソッドを削除(`v.openPlaces` キーは維持)。

これにより RoomEngine から約20行の委譲が消え、「ジェスチャ/シートの挙動を読むのに3ファイル辿る」ホップが1つ減る。
ただし issue #103/#104 の「公開名維持」判断を上書きすることになるため、実施時は当該 Issue を参照した上で PR を分けること。

## 運用ルール(提案)

- 新たに「純転送だけの層」を追加しない。層を跨ぐ値を追加するときは、途中の層で変換・判断が入らないなら直接参照を検討する。
- リファクタで一時的に転送層(公開名維持)を作った場合は、**足場である旨と撤去条件をコメントに残す**(W1/W2 の轍)。
- 可変モジュール状態(W6/W7 パターン)を増やす場合は、必ず「実行時に差し替わる」旨のコメントを export 箇所に付ける。
