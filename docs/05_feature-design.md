# 05 機能・データ設計(マップ / ルーム / 集合場所)

関連:[00_overview](./00_overview.md) / [01 ディレクトリ](./01_directory-design.md) / [02 技術設計](./02_technical-design.md) / [imasoko-dev-docs.md](./imasoko-dev-docs.md)(API/WS/座標の一次資料) / [企画書](./imasoko-kikakusho.md)

企画書で追加・具体化された機能の**設計とデータモデル**をまとめる。dev-docs(§5 REST / §6 WS / §7 座標)の拡張という位置づけ。実装に必要な型・API・WS・データ配置・TODOをここで定義する。

## 0. 決定サマリ

| 項目 | 決定 |
|---|---|
| ルームTTL | **デフォルト2時間**(`config.py` で設定可) |
| 途中退出 | **可能**(明示退出ボタン + WS切断の両方で離脱) |
| サーバ保持データ | **最新位置のみ**(履歴を残さない) |
| マップ形式/対象/作画 | **SVG / 有明キャンパス / 作画=ホスト** |
| マップ構成 | **3エリア切替**:国際展示場駅・東京テレポート駅・キャンパス |
| キャンパス | 建物(1号館…)を選ぶと**階・各階の教室**を視覚表示(ドリルダウン) |
| ルーム公開範囲 | **private / public 切替**、既定 **private** |
| 集合場所 | **座標 / メンバー / 場所(教室・「1号館前」等)** の3タイプ |
| 空き教室 | 参加者が候補を追加できる。マスタは**当面 手入力CSV**(将来 公式データ) |

---

## 1. マップ:3エリア切替(駅×2 + キャンパス)

マップは1枚絵ではなく、**3つの独立SVG**を切り替える。各エリアは自前の縮尺・座標系を持つため、キャリブレーション(対角2点の緯度経度, [dev-docs §7](./imasoko-dev-docs.md))も**エリアごと**に持つ。

```
エリア:
  station_1  国際展示場駅
  station_2  東京テレポート駅
  campus     有明キャンパス
```

### データモデル(`apps/web/src/lib/mapAreas.ts`)

```ts
// station_1=国際展示場駅, station_2=東京テレポート駅, campus=有明キャンパス
export type AreaId = "station_1" | "station_2" | "campus";

export interface MapArea {
  id: AreaId;
  name: string;            // 表示名(例:"有明キャンパス")
  svg: string;             // /map/campus.svg
  width: number;           // SVGの論理px(coords変換用)
  height: number;
  bounds: {                // キャリブレーション2点(実測して差し替え)
    lat0: number; lng0: number;   // 画像左上=北西角
    lat1: number; lng1: number;   // 画像右下=南東角
  };
}
export const MAP_AREAS: Record<AreaId, MapArea> = { /* 3エリア分 */ };
```

### 座標変換とエリア判定(`coords.ts`)

- 変換式は [dev-docs §7](./imasoko-dev-docs.md) と同じだが、**引数に `MapArea` を取り**、そのエリアの `bounds`/`width`/`height` で計算する
- `resolveArea(lat, lng): AreaId | null` — どのエリアの `bounds` に入るか判定(複数該当なら近い方、どれにも入らなければ `null`=全エリア圏外)
- 圏外(選択エリアの `u,v` が 0..1 外)は [dev-docs §7 の決定](./imasoko-dev-docs.md)どおり**マップ端にクランプして「圏外」表示**

### UI(`AreaSwitcher.tsx` + `MapView.tsx`)

- 上部に3セグメントのエリア切替。手動切替 + 自分の現在地から自動選択(`resolveArea`)
- 選択エリアのSVGを `imageOverlay`(`CRS.Simple`)で表示し、参加者ピンをそのエリアの座標系で再投影
- 参加者一覧には各人がどのエリアにいるか(または圏外)を出す

---

## 2. キャンパス:建物→階→教室のドリルダウン

campus エリアで**建物(1号館・2号館…)を選ぶ**と、その建物の**階と各階の教室**を視覚的に表示する。選択手段は「マップ上の建物クリック領域」と「メニュー一覧」の両対応。

### データモデル(キャンパスマスタ)

サーバがマスターを保持し、`GET /api/campus` でフロントへ配信する(**front/back で単一ソース**)。

```jsonc
// apps/server/data/buildings.json
{
  "buildings": [
    {
      "id": "b1", "name": "1号館",
      "svgRegionId": "region-b1",        // campus.svg 内のクリック領域idと対応
      "spots": [                          // 集合ランドマーク(§4 place)
        { "id": "b1-front", "label": "1号館前", "area": "campus", "lat": 0, "lng": 0 }
      ],
      "floors": [
        { "level": "1F", "rooms": [ { "id": "b1-101", "name": "101" } ] },
        { "level": "2F", "rooms": [ { "id": "b1-201", "name": "201" } ] }
      ]
    }
  ]
}
```

- `svgRegionId`:`campus.svg` に描いた建物の当たり判定領域(`<g id="region-b1">` 等)と紐付け、クリック→建物選択を実現
- 教室 `rooms` は建物・階に属する。教室の位置は建物位置で近似(集合場所の距離表示用, §4)

### UI

- `CampusView.tsx`(建物メニュー + 建物詳細)。建物選択 → 階リスト → 各階の教室を表示
- クリック領域 `svgRegionId` ↔ `building.id` の対応表で、SVGクリックと同じ選択を実現
- 各階に、その階を自己申告しているメンバーを並べる([design/05](./design/05_building-panel.md))。これには階の自己申告を**建物+階**で持つ必要があり、`floor` メッセージに `building_id` を追加する([dev-docs §6](./imasoko-dev-docs.md))

---

## 3. ルーム:public / private

ルームに公開範囲を持たせる。**既定は private**(使い捨て・URLを知る人だけ、という現行方針を維持)。

| visibility | 参加 | 発見性 |
|---|---|---|
| `private`(既定) | 推測困難な `room_id` を含むURLを知る人だけ | 一覧に出ない |
| `public` | URLなしでも参加可 | `GET /api/rooms/public` の一覧に載る |

### 所有権(host_token)

公開範囲の切替は「全員の現在地を不特定多数に晒す」変更なので、**作成者のみ**が行えるようにする。ログインは無いので軽量トークンで代替する。

- `POST /api/rooms` のレスポンスに `host_token`(推測困難)を含める
- クライアントは `host_token` を `localStorage` に保存
- `visibility` 切替など host 限定操作は `host_token` を必須にする

> `host_token` は「ホストだけができる操作」を将来増やす際の土台にもなる。導入が重いと判断すれば「room内の誰でも切替可」に簡略化してよい(ただし public 化の footgun に注意)。

### プライバシー注意

public はルームの全員の**現在地をURLなしで誰でも見られる**状態になる。既定 private を厳守し、public 化のUIには警告を出す。ルームには公開一覧用の `title`(任意)を持たせる。

---

## 4. 集合場所:3タイプ + 空き教室の追加

集合場所は誰でも設定できる(企画書4.4を踏襲)。指定方法を**3タイプ**に拡張する。

### MeetingPoint(タグ付きユニオン)

```ts
type MeetingPoint =
  | { kind: "coords";  area: AreaId; lat: number; lng: number }   // マップをタップした地点
  | { kind: "member";  memberId: string }                          // 「Xさんのところ」= その人の現在地に追従
  | { kind: "place";   place: PlaceRef };                          // 教室 or 建物ランドマーク

type PlaceRef =
  | { type: "classroom";     roomId: string }        // buildings.json の教室id
  | { type: "building_spot"; spotId: string };       // 例:"b1-front"(1号館前)
```

- `member`:指定メンバーの位置に追従する(その人が動けば集合地点も動く)
- `place`:教室 or ランドマーク。表示・距離計算は campus マスタの座標で行う(教室は建物位置で近似)
- 各参加者から集合場所までのおおよその距離を表示(企画書4.4案)

### 空き教室のユーザー追加(crowd-sourced)

参加者がそれぞれ別の場所にいる前提で、**空いている教室などの候補を各自が追加**できる。追加された候補は全員に共有され、そこから集合場所を選べる。

```ts
interface PlaceSuggestion {
  id: string;
  place: PlaceRef;         // 主に classroom
  note?: string;           // 例:"3Fの奥、空いてる"
  addedBy: string;         // memberId
  createdAt: string;
}
```

- ルーム単位で `place_suggestions: PlaceSuggestion[]` を**メモリ保持**(履歴は残さず、ルーム消滅で消える)
- 誰でも add 可。採用時は `set_meeting_point`(`kind:"place"`)へ

---

## 5. 空き教室データ(技術制約)

- **空き教室(授業がない部屋)は本来データで取得可能だが、規約等の問題で当面は手入力CSV**とする
- マスタ配置:
  - `apps/server/data/classrooms.csv` — 教室マスタ(+ 手入力の空き情報)
  - `apps/server/data/buildings.json` — 建物→階→教室 + SVG領域・ランドマーク(§2)
- CSVスキーマ(最小案):

```csv
building_id,floor,room_id,name,capacity,note
b1,3F,b1-301,301,40,当面は手入力の空き情報をnoteに
```

- サーバ起動時にメモリへロードし、`GET /api/campus` で配信
- **将来**:規約クリア後に公式の空き時間データへ差し替える。読込を `campus.py` の1関数に閉じ込め、**差し替え点を1箇所**にする

---

## 6. API / WS 追加(dev-docs §5/§6の拡張)

### REST

| メソッド パス | 変更/追加 |
|---|---|
| `POST /api/rooms` | body に `title?` `visibility?`。レスポンスに **`host_token`** `visibility` を追加 |
| `GET /api/rooms/public` | **追加**。public かつ有効なルーム一覧 `[{room_id, title, members, expires_at}]` |
| `PATCH /api/rooms/{id}/visibility` | **追加**。`host_token` 必須。private⇔public 切替 |
| `GET /api/campus` | **追加**。`{ areas, buildings }`(マップエリア定義 + 建物/階/教室) |

### WebSocket(`type` で分岐, [dev-docs §6](./imasoko-dev-docs.md)を拡張)

client → server:
```jsonc
{ "type": "leave" }                                   // 明示退出(§0 途中退出)
{ "type": "meeting_point", "point": { /* MeetingPoint union */ } }   // §4 で置換
{ "type": "add_place_suggestion", "place": { /* PlaceRef */ }, "note": "空いてる" }
```

server → client(既存に追加):
```jsonc
{ "type": "meeting_point", "point": { /* union or null */ } }
{ "type": "place_suggestions", "items": [ /* PlaceSuggestion[] */ ] }
{ "type": "member_left", "id": "a1b2" }               // 明示退出でも同じ
```

- `member` 型の集合場所は、対象メンバーの `member_update` を受けてUI側で追従表示(サーバは座標を再送しない)
- すべて**最新値のみ**保持(履歴なし)

---

## 7. 実装分担(案)

| 領域 | 担当 |
|---|---|
| マップ3エリア・`mapAreas.ts`・`coords.ts`(エリア別)・SVG作画 | ホスト |
| キャンパス建物データ(`buildings.json`)・`CampusView` | ホスト(データ)+ 初心者B(loader) |
| `campus.py`(マスタ読込・`GET /api/campus`)・`classrooms.csv` | 初心者B |
| ルーム公開範囲・`host_token`・`/api/rooms/public` | 初心者A(`rooms.py`) |
| 集合場所3タイプ・空き教室追加(`handlers.py`) | 初心者C |

## TODO

> 実装状況の詳細は [06 実装ステータス §4.6](./06_implementation-status.md)。**フロント↔サーバーは実配線済み(WS/REST/実GPS)。地図は OSM GeoJSON の実地理描画。**

### マップ(§1・§2)
- [ ] 各エリアの**対象範囲**を確定(現状は模式・エリア名のみ確定)
- [x] 3エリアを実地理化 → **OSM GeoJSON を実行時投影**(`src/lib/*Geo.ts` + `src/components/map/AreaSvg.tsx`、issue #3。[06 §2](./06_implementation-status.md))
- [ ] 各エリアのキャリブレーション2点を実測 → `mapAreas.ts` に反映(現状プレースホルダ値)
- [x] `coords.ts` を**エリア別**に変更 + `resolveArea()` 実装 + ユニットテスト([02 §6](./02_technical-design.md))
- [x] `AreaSwitcher.tsx` 実装(手動切替 + 現在地から自動選択)
- [ ] `campus.svg` に建物クリック領域(`svgRegionId`)→ **現状はインラインの建物 div クリックで代替**
- [x] `buildings.json` に建物→階→教室 + ランドマークを入力(server `data/` + front `campusData.ts`)
- [x] `CampusView.tsx`(建物メニュー + 詳細ドリルダウン)実装

### ルーム公開範囲(§3)
- [x] `Room` に `visibility`(既定 private)・`title`・`host_token` を追加
- [x] `POST /api/rooms` を `visibility`/`title` 受付・`host_token` 返却に拡張
- [x] `GET /api/rooms/public` 実装
- [x] `PATCH /api/rooms/{id}/visibility`(`host_token` 検証)実装
- [x] フロント:public化の**警告UI** + 公開一覧画面

### 集合場所・空き教室(§4・§5)
- [x] `MeetingPoint` / `PlaceRef` / `PlaceSuggestion` の型を定義(TS: `types/campus.ts`・`types/messages.ts`, Py: `models.py`)
- [x] `handlers.py`:`meeting_point`(3タイプ)・`add_place_suggestion`・`leave` を実装
- [x] `MeetingPointPicker.tsx`(座標/メンバー/場所の選択)実装
- [x] `PlaceSuggestions.tsx`(候補の追加・一覧・採用)実装
- [x] `classrooms.csv` を手入力で用意
- [x] `campus.py`:CSV/JSON をメモリロードし `GET /api/campus` で配信(差し替え点を1関数に)
- [x] 各参加者→集合場所の距離表示

### 退出・TTL(§0)
- [x] 明示退出ボタン + `leave` メッセージ、切断時と共通の `member_left` 処理
- [x] `config.py` の TTL を**既定2時間**に設定([02 §2](./02_technical-design.md))※ フロントは「集合時間+3h」で相違([06 §2](./06_implementation-status.md))

### 決定の反映
- [x] 本ドキュメントの決定を [dev-docs](./imasoko-dev-docs.md) と[企画書](./imasoko-kikakusho.md)に反映済み
