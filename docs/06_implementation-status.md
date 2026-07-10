# 06 実装ステータス(差分サマリ・最新情報・TODO)

最終更新:2026-07-06

Claude Design のプロトタイプ `いまそこ Prototype.dc.html` を、本ドキュメント群(00〜05・design)に沿って実装した結果の**現状**をまとめる。
以降、実装の「今どうなっているか」はここを一次情報とする(各ドキュメントの設計意図は 00〜05 を参照)。

> **2026-07-06 構造リファクタリング(挙動不変)** — 親 Issue #87(server)/ #88(web)+ sub 20本で、フロント・バック全体を構造リファクタした(PR #109〜#128)。挙動・API のワイヤ契約は不変(既存テスト緑・送出 JSON バイト一致で検証)。主な変更:web は `RoomEngine.renderVals()`(441行)を `state/selectors/*` へ分離、地図ジェスチャ/シート操作を各 Controller へ、色をデザイントークン化。server は `main.py`(188→37行)を `app/routes/*` の APIRouter へ分割、server→client を型付きメッセージ(`RoomStateMsg` 等 + `MsgType`)に。本節以降に反映済み。

---

## 1. 差分サマリ(何を作ったか)

| 領域 | 実体 | 状態 |
|---|---|---|
| `apps/web` | React + TypeScript(Vite)。RoomEngine(状態機械)+ セレクタ/コントローラ構成(約67ファイル) | ✅ 実装済み・実サーバー配線済み |
| `apps/server` | FastAPI。REST/WS を APIRouter で分割・型付きメッセージ・インメモリ | ✅ 起動可・テスト緑 |
| `.github/workflows` | `web-ci` / `server-ci` / `deploy` | ✅ 追加(CIコマンドはローカル緑) |
| `.github`(テンプレート) | PR / Issue(task・bug・feature・config)/ CODEOWNERS / dependabot | ✅ 追加 |
| `deploy/` | `Dockerfile`(マルチステージ)/ `docker-compose.yml` | ✅ 追加(**Caddyは不採用**) |
| ルート | `.gitignore` / `.editorconfig` / `.dockerignore` / `CONTRIBUTING.md` / `README.md` | ✅ 追加・更新 |

### apps/web の構成(移植方針)

- プロトタイプの状態機械(`DCLogic` クラス)を **`src/state/RoomEngine.ts`** に移植し、`RoomContext.tsx`(`useSyncExternalStore`)で React にブリッジ。
  - リファクタで、描画派生値は **`src/state/selectors/{mapVals,sheetVals,topVals}.ts`** に分離(`renderVals()` はこれらのスプレッド合成のみ)。地図ジェスチャは **`MapGestureController`**、シート開閉/ドラッグは **`SheetController`** に分離。WS 受信は per-message ハンドラ、色は **`lib/theme.ts`** のトークン、選択チップ色は `lib/chipColors.ts` に集約。
- 画面:トップ / 公開一覧 / 参加フォーム / 地図 / 終了系(期限切れ・終了・NotFound・満員)= **8画面**。
- 重畳UI:メンバー / 建物 / 集合場所 / 空き教室 / 共有 / 設定 の **6シート**(空き教室は集合場所から分離。issue #149)、作成 / 位置許可 / ピン / 公開警告 / 退出 の **5モーダル**、トースト。
- 他メンバーは**実 WS**(`onServerMsg`)の受信で反映、自分の位置は**実 GPS**(`useGeolocation`)で反映(プロトタイプのシミュレーション歩行は撤去済み)。
- ディレクトリは docs/01 準拠(`components / hooks / lib / types / state / pages`)。

### apps/server の構成

- `app/`:`config` / `models` / `rooms` / `expiry` / `ws` / `handlers` / `campus` / `main`。
  - リファクタで `main.py`(188→37行)を `create_app()` ファクトリ + **`app/routes/{meta,rooms,campus,ws,spa}.py`** の APIRouter に分割。`from app.main import app` は維持。
  - server→client メッセージは `models.py` の型付きクラス群(`RoomStateMsg` / `MemberJoinedMsg` / … / `RoomFullMsg`)+ `MsgType` 定数 + `MeetingPoint`/`PlaceSuggestion` 型で構成(`ServerMsg` union は web 側 `messages.ts` のみ)。WS 受信ループから独立した `handlers.establish_join` / `cleanup_on_disconnect` を抽出。
- REST:`POST /api/rooms`・`GET /api/rooms/{id}`・`GET /api/rooms/public`・`PATCH /api/rooms/{id}/visibility`・`GET /api/campus`(パス・挙動は不変)。
- WS:`/ws/{room_id}`(join → room_state → position / floor / meeting_point / add_place_suggestion / leave)。
- `data/buildings.json` + `data/classrooms.csv`、`tests/`(rooms / expiry / ws / config / campus)。
- 空き教室:`classrooms.csv` は MUSCAT 実データ(91教室・`scripts/classinfo_to_csv.py` で生成、issue #140)。`GET /api/campus` の `classrooms[]` は `capacity`(数値)・`date`・`available[{start,end}]` を構造化配信(issue #141)。web は空き教室追加パネルで空き状態(集合時刻時点)・収容人数・空き時間帯を表示(issue #142)。

---

## 2. プロトタイプ ↔ docs の差分(要確認・ここが最新の決定)

当初「プロトタイプ忠実」で始めた相違点と、その後の決定・実装状況。**下記はいずれも決定済み/実装済み**(実配線・実地理も接続済み)。作成フロー(2)のみ docs 本文の当初案と異なる仕様で確定している。

1. **有効期限モデル** — ✅ **決定済み(issue #4):「集合時間(`meet_at`)+ 3時間」で自動終了**に統一。
   フロントは `END_OFFSET = 3h`(`apps/web/src/lib/constants.ts`)、サーバーは `expires_at = meet_at + end_offset_seconds`(`apps/server/app/config.py` / `rooms.py`)で一致。
   `POST /api/rooms` は任意の `meet_at`(ISO 8601)を受け取り(未指定なら作成時刻を集合時間とみなす)、`meet_at` と `expires_at` を返す。
2. **作成フロー** — docs は [ルームを作る]即作成(private固定)。フロントは **作成モーダル**でルーム名・公開範囲・集合時間を先に指定。
3. **地図/座標** — ✅ 実地理化済み。3エリアとも **OSM GeoJSON を実行時投影する実地理マップ**(`src/lib/{areaGeo,campusGeo,station1Geo,station2Geo}.ts` + `src/data/*.geojson.json`、issue #3)。`apps/web/src/lib/coords.ts`(`project` / `resolveArea` / クランプ)は実位置取得経路で**実際に使用中**(ユニットテスト済み)。
4. **3エリアSVG** — `public/map/*.svg` ではなく、実地理 GeoJSON をインライン描画。3エリア(campus/station_1/station_2)を `src/lib/areaRegistry.ts` に集約し、`src/components/map/AreaSvg.tsx`(レジストリ参照ラッパ)+ `AreaGeoSvg.tsx`(共通レンダラ)で描画(旧 `CampusSvg`/`Station1Svg`/`Station2Svg` は撤去)。
5. **フロント↔サーバーの実配線** — ✅ 接続済み。`src/state/RoomContext.tsx` が `useRoomSocket`(WS・再接続/join再送, issue #1)と `useGeolocation`(実GPS, issue #2)を実サーバーへ配線し、`src/lib/api.ts` の REST(作成/取得/公開一覧/visibility)・`loadCampus`(#14)/`loadConfig`(#15)も実呼び出し。

---

## 3. 検証結果(ローカル、CIと同一コマンド)

| 対象 | コマンド | 結果 |
|---|---|---|
| web | `lint` / `typecheck` / `format:check` | ✅(lint は warning 1・0 errors) |
| web | `test`(Vitest)/ `build` | ✅ 86 passed / ビルド成功 |
| server | `ruff check` / `ruff format --check` / `pytest` | ✅ / 整形済 / **21 passed** |
| CI 設定 | workflows・templates・compose の YAML | ✅ 構文OK |

---

## 4. 細かいTODO(領域別・完了はチェック済み)

### 4.1 apps/web(フロント)
- [x] Vite + React + TS 初期化・`vite.config` に `/api`・`/ws` proxy
- [x] デザイントークン(`styles/tokens.css`)+ keyframes(`styles/global.css`)
- [x] `RoomEngine`(状態機械)+ `RoomContext`(`useSyncExternalStore`)
- [x] DS コンポーネント(`Button` / `Input` / `Radio` / `MeshGradient` / `Modal` / `BottomSheet`)
- [x] 8画面(トップ/公開一覧/参加/地図/期限切れ/終了/NotFound/満員)
- [x] 6シート(メンバー/建物/集合場所/空き教室/共有/設定)
- [x] 5モーダル(作成/位置許可/ピン/公開警告/退出)+ トースト
- [x] 地図の pan/zoom・ピン・圏外クランプ・建物クリック・FAB
- [x] `coords.ts`(lat/lng→map・`resolveArea`・クランプ)+ ユニットテスト
- [x] `useGeolocation`(拒否=閲覧のみ)/ `useRoomSocket`(指数バックオフ+join再送)
- [x] App スモークテスト(トップ→作成→参加、公開一覧遷移)
- [x] 実位置取得(`useGeolocation`)→ `coords.ts` 変換 → 自分ピン反映 + throttle 送信の**実配線**(issue #2、`RoomContext.tsx`)
- [x] `useRoomSocket` を実サーバーへ接続(join → room_state / member_update / meeting_point 等を反映、issue #1)
- [x] **構造リファクタ(#88・挙動不変)**:`renderVals` を `state/selectors/*` へ分離 / `MapGestureController`・`SheetController` / `onServerMsg` の per-message 化 / `lib/theme.ts` トークン化 / 3エリアを `areaRegistry`+`AreaSvg` に統合 / アフィン型一本化

### 4.2 apps/server(バックエンド)
- [x] `config.py`(TTL/上限/静的配信・`IMASOKO_` env 上書き)
- [x] `models.py`(Client/Server メッセージ・discriminated union)
- [x] `rooms.py`(作成/取得/期限/public/visibility・`secrets.token_urlsafe`)
- [x] `expiry.py`(掃除タスク)/ `ws.py`(ConnectionManager)/ `handlers.py`(各メッセージ)
- [x] `campus.py` + `data/buildings.json` + `data/classrooms.csv`(`GET /api/campus`)
- [x] `main.py`(REST + WS + SPA フォールバック配信)→ リファクタで `create_app()` + `app/routes/*` に分割(#87)
- [x] 入力バリデーション(name長・lat/lng範囲)・人数上限 join 拒否
- [x] `pytest`(rooms/expiry/ws/config・WS は floor/place/leave/不正/building_spot まで回帰)
- [x] 有効期限モデルを「集合時間(`meet_at`)+3h」に**統一**(issue #4)。`end_offset_seconds` + `POST /api/rooms` の任意 `meet_at`
- [x] **構造リファクタ(#87・挙動不変)**:`routes/` 分割 / `HTTPException`→ドメイン例外 / server→client を型付きメッセージ(`RoomStateMsg` 等)・`MsgType` 定数化 / dict直アクセス撲滅 / `Optional[X]`→`X|None`。副産物で `building_spot` 集合場所提案のクラッシュ既存バグを修正
- [ ] `mypy` を `continue-on-error` から必須へ格上げ

### 4.3 CI/CD
- [x] `apps/web/package.json` scripts(`lint`/`typecheck`/`format`/`format:check`/`test`/`build`)
- [x] ESLint(flat config)/ Prettier / Ruff / pytest 設定
- [x] `.github/workflows/web-ci.yml`(path filter・cache・concurrency)
- [x] `.github/workflows/server-ci.yml`
- [x] `.github/workflows/deploy.yml`(Secrets 未設定なら無害スキップ)
- [ ] ダミーPRで両CIが緑になることを確認(GitHub 上)
- [ ] `main` ブランチ保護(status checks `build`/`test` + レビュー1)
- [ ] `deploy` 用 Secrets 登録(`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`)

### 4.4 GitHub テンプレート
- [x] `pull_request_template.md`
- [x] `ISSUE_TEMPLATE/`(task / bug_report / feature_request / config)
- [x] `CODEOWNERS`(暫定でホストに集約)
- [x] `dependabot.yml`
- [x] ルート `CONTRIBUTING.md`
- [ ] CODEOWNERS に初心者A/B/C の GitHub ハンドルを追記
- [ ] リポジトリ設定:Squash merge のみ許可 / head branch 自動削除
- [x] ラベル作成(`task`/`bug`/`enhancement`/`web`/`server`/`infra`/`docs`/`good first issue`/`blocked`/`priority:p0`/`priority:p1`/`priority:p2`)
- [x] 旧 `priority:high` を `priority:p0` へ統合(付け替え + 旧ラベル削除・済み)

### 4.5 デプロイ
- [x] `deploy/Dockerfile`(web ビルド → FastAPI 静的配信・1ワーカー)
- [x] `deploy/docker-compose.yml` / `.dockerignore`
- [x] Caddy は**不採用**(リバースプロキシは各自の運用に委ねる。nginx は `/ws` の Upgrade/Connection 転送が必要)
- [ ] サーバーで手動デプロイを一度成功させ、**HTTPS + WSS 疎通を実機確認**

### 4.6 マップ・データ(docs/05)
- [x] 3エリア切替(`AreaSwitcher`)+ エリア別 `resolveArea`
- [x] 建物ドリルダウン(`CampusView`)+ 建物/階/教室データ
- [x] 集合場所3タイプ(座標/メンバー/場所)+ 空き教室候補(追加・採用)
- [x] 公開範囲(private/public)切替 + 公開警告 + 公開一覧
- [x] 明示退出 + 各参加者→集合場所の距離表示(GPS 実測ベース、issue #28)
- [x] 実地理化:3エリアとも OSM GeoJSON を実行時投影(issue #3)。距離は GPS 実測へ移行済み(issue #28)

---

## 5. 残課題の要点(コード外・要手作業)

- **リポジトリ設定**:ブランチ保護 / CODEOWNERS ハンドル / deploy Secrets(ラベル・Squash は対応済み)。
- ~~**設計統一**:有効期限モデル(集合時間+3h ⇔ 作成+2h)をどちらかに決定。~~ → ✅ 集合時間+3h に決定・実装(issue #4)
- ~~**実配線**:フロント → 実サーバー(WS/REST)接続、実位置取得。~~ → ✅ 接続済み(WS=#1 / GPS=#2 / campus=#14 / config=#15)
- ~~**地図精度**:実地理SVG + キャリブレーション実測。~~ → ✅ OSM GeoJSON 実行時投影(#3)+ GPS 実測距離(#28)に移行済み
- **実機**:HTTPS/WSS 疎通、複数端末での同時表示。
