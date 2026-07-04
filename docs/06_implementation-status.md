# 06 実装ステータス(差分サマリ・最新情報・TODO)

最終更新:2026-07-04

Claude Design のプロトタイプ `いまそこ Prototype.dc.html` を、本ドキュメント群(00〜05・design)に沿って実装した結果の**現状**をまとめる。
以降、実装の「今どうなっているか」はここを一次情報とする(各ドキュメントの設計意図は 00〜05 を参照)。

---

## 1. 差分サマリ(何を作ったか)

| 領域 | 実体 | 状態 |
|---|---|---|
| `apps/web` | React + TypeScript(Vite)。**プロトタイプの忠実移植**(53ファイル) | ✅ 実装済み・自走 |
| `apps/server` | FastAPI。REST + WebSocket + 有効期限 + キャンパスマスタの**雛形** | ✅ 起動可・テスト緑 |
| `.github/workflows` | `web-ci` / `server-ci` / `deploy` | ✅ 追加(CIコマンドはローカル緑) |
| `.github`(テンプレート) | PR / Issue(task・bug・feature・config)/ CODEOWNERS / dependabot | ✅ 追加 |
| `deploy/` | `Dockerfile`(マルチステージ)/ `docker-compose.yml` | ✅ 追加(**Caddyは不採用**) |
| ルート | `.gitignore` / `.editorconfig` / `.dockerignore` / `CONTRIBUTING.md` / `README.md` | ✅ 追加・更新 |

### apps/web の構成(移植方針)

- プロトタイプの状態機械(`DCLogic` クラス)を **`src/state/RoomEngine.ts`** に 1:1 移植し、`RoomContext.tsx`(`useSyncExternalStore`)で React にブリッジ。派生値は `renderVals()` 相当。
- 画面:トップ / 公開一覧 / 参加フォーム / 地図 / 終了系(期限切れ・終了・NotFound・満員)= **8画面**。
- 重畳UI:メンバー / 建物 / 集合場所+空き教室 / 共有 / 設定 の **5シート**、作成 / 位置許可 / ピン / 公開警告 / 退出 / 接続失敗 の **6モーダル**、トースト、**DEMOパネル**(状態切替)。
- 参加者はプロトタイプ同様 **シミュレーションで自走**(ゆうた/さき/みお が歩く)。
- ディレクトリは docs/01 準拠(`components / hooks / lib / types / state / pages`)。

### apps/server の構成(雛形)

- `app/`:`config` / `models` / `rooms` / `expiry` / `ws` / `handlers` / `campus` / `main`。
- REST:`POST /api/rooms`・`GET /api/rooms/{id}`・`GET /api/rooms/public`・`PATCH /api/rooms/{id}/visibility`・`GET /api/campus`。
- WS:`/ws/{room_id}`(join → room_state → position / floor / meeting_point / add_place_suggestion / leave)。
- `data/buildings.json` + `data/classrooms.csv`、`tests/`(rooms / expiry / ws)。

---

## 2. プロトタイプ ↔ docs の差分(要確認・ここが最新の決定)

「プロトタイプ忠実」を優先したため、フロントは docs と次の点で異なる。**チームで最終確認し、必要なら docs 本文へ反映する。**

1. **有効期限モデル** — ✅ **決定済み(issue #4):「集合時間(`meet_at`)+ 3時間」で自動終了**に統一。
   フロントは `END_OFFSET = 3h`(`apps/web/src/lib/constants.ts`)、サーバーは `expires_at = meet_at + end_offset_seconds`(`apps/server/app/config.py` / `rooms.py`)で一致。
   `POST /api/rooms` は任意の `meet_at`(ISO 8601)を受け取り(未指定なら作成時刻を集合時間とみなす)、`meet_at` と `expires_at` を返す。
2. **作成フロー** — docs は [ルームを作る]即作成(private固定)。フロントは **作成モーダル**でルーム名・公開範囲・集合時間を先に指定。
3. **地図/座標** — docs は実地理トレースSVG + lat/lng キャリブレーション変換。フロントのデモは **模式SVG(インラインコンポーネント)+ 直接 x/y**。
   docs の変換(`apps/web/src/lib/coords.ts`:`project` / `resolveArea` / クランプ)は**実装 + ユニットテスト済み**で、実位置取得経路で使う想定。
4. **3エリアSVG** — `public/map/*.svg` ではなく、`src/components/map/{CampusSvg,Station1Svg,Station2Svg}.tsx` のインライン模式SVGで実装。
5. **フロント↔サーバーの実配線は未接続** — デモはシミュレーションで自走する。実接続の土台は `src/hooks/useRoomSocket.ts`(WS再接続/join再送)・`src/lib/api.ts`(REST)にある。

---

## 3. 検証結果(ローカル、CIと同一コマンド)

| 対象 | コマンド | 結果 |
|---|---|---|
| web | `lint` / `typecheck` / `format:check` | ✅(lint は warning 1・0 errors) |
| web | `test`(Vitest)/ `build` | ✅ 10 passed / ビルド成功 |
| server | `ruff check` / `ruff format --check` / `pytest` | ✅ / 整形済 / **8 passed** |
| CI 設定 | workflows・templates・compose の YAML | ✅ 構文OK |

---

## 4. 細かいTODO(領域別・完了はチェック済み)

### 4.1 apps/web(フロント)
- [x] Vite + React + TS 初期化・`vite.config` に `/api`・`/ws` proxy
- [x] デザイントークン(`styles/tokens.css`)+ keyframes(`styles/global.css`)
- [x] `RoomEngine`(状態機械)+ `RoomContext`(`useSyncExternalStore`)
- [x] DS コンポーネント(`Button` / `Input` / `Radio` / `MeshGradient` / `Modal` / `BottomSheet`)
- [x] 8画面(トップ/公開一覧/参加/地図/期限切れ/終了/NotFound/満員)
- [x] 5シート(メンバー/建物/集合場所+空き教室/共有/設定)
- [x] 6モーダル(作成/位置許可/ピン/公開警告/退出/接続失敗)+ トースト + DEMOパネル
- [x] 地図の pan/zoom・ピン・圏外クランプ・建物クリック・FAB
- [x] `coords.ts`(lat/lng→map・`resolveArea`・クランプ)+ ユニットテスト
- [x] `useGeolocation`(拒否=閲覧のみ)/ `useRoomSocket`(指数バックオフ+join再送)の雛形
- [x] App スモークテスト(トップ→作成→参加、公開一覧遷移)
- [ ] 実位置取得 → `coords.ts` 変換 → ピン反映の**実配線**(現状シミュレーション)
- [ ] `useRoomSocket` を実サーバーへ接続(room_state/member_update 反映)

### 4.2 apps/server(バックエンド雛形)
- [x] `config.py`(TTL/上限/静的配信・`IMASOKO_` env 上書き)
- [x] `models.py`(Client/Server メッセージ・discriminated union)
- [x] `rooms.py`(作成/取得/期限/public/visibility・`secrets.token_urlsafe`)
- [x] `expiry.py`(掃除タスク)/ `ws.py`(ConnectionManager)/ `handlers.py`(各メッセージ)
- [x] `campus.py` + `data/buildings.json` + `data/classrooms.csv`(`GET /api/campus`)
- [x] `main.py`(REST + WS + SPA フォールバック配信)
- [x] 入力バリデーション(name長・lat/lng範囲)・人数上限 join 拒否
- [x] `pytest`(rooms/expiry/ws)
- [x] 有効期限モデルを「集合時間(`meet_at`)+3h」に**統一**(issue #4)。`end_offset_seconds` + `POST /api/rooms` の任意 `meet_at`
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
- [ ] ラベル作成(`task`/`bug`/`enhancement`/`web`/`server`/`infra`/`docs`/`good first issue`/`priority:high`/`blocked`)

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
- [x] 明示退出 + 各参加者→集合場所の距離表示
- [ ] 実地理トレースSVG化 + キャリブレーション2点の**実測**(現状は模式・プレースホルダ)

---

## 5. 残課題の要点(コード外・要手作業)

- **リポジトリ設定**:ブランチ保護 / Squash設定 / ラベル / CODEOWNERS ハンドル / deploy Secrets。
- ~~**設計統一**:有効期限モデル(集合時間+3h ⇔ 作成+2h)をどちらかに決定。~~ → ✅ 集合時間+3h に決定・実装(issue #4)
- **実配線**:フロント(シミュレーション)→ 実サーバー(WS/REST)接続、実位置取得。
- **地図精度**:実地理SVG + キャリブレーション実測。
- **実機**:HTTPS/WSS 疎通、複数端末での同時表示。
