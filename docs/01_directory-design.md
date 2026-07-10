# 01 ディレクトリ設計

関連:[00_overview](./00_overview.md) / [imasoko-dev-docs §3](./imasoko-dev-docs.md)

開発ドキュメント §3 の構成案を、CI/CD・テスト・テンプレート・デプロイまで含めた**リポジトリ全体構成**に拡張する。目的は「誰がどこを触るか」を一意に決め、初心者3人が迷わず並行作業できるようにすること。

## 方針

- **モノレポ**:Web(React)と Server(FastAPI)を1リポジトリに置く。小規模チーム・同時デプロイのため分割しない
- **トップレベルに `frontend/` `backend/` を並べない**:コードは `apps/` 配下に集約し、トップレベルからは技術レイヤ名を消す。`apps/web/`(React)と `apps/server/`(FastAPI)に分ける
- **同一オリジン配信**:本番は `apps/web` のビルド成果物を `apps/server` の FastAPI `StaticFiles` で配信(CORS不要、[dev-docs §1](./imasoko-dev-docs.md))
- **責務の分離**:1ファイル1責務。特に server は担当者ごとにファイルを分け、コンフリクトを避ける
- **設定は一元化**:マジックナンバー(TTL・throttle等)は定数モジュール1箇所に集約([02](./02_technical-design.md))

## リポジトリ全体構成

```
imasoko/
├─ apps/
│  ├─ web/                       # React + TypeScript (Vite)
│  │  ├─ public/
│  │  │  └─ map/                 # ⚠ 不採用:実装は src/data の OSM GeoJSON + src/components/map(#3)。下記 svg は未使用
│  │  │     ├─ station-1.svg     # 国際展示場駅
│  │  │     ├─ station-2.svg     # 東京テレポート駅
│  │  │     └─ campus.svg        # 有明キャンパス(建物クリック領域つき)
│  │  ├─ src/
│  │  │  ├─ components/          # 表示コンポーネント
│  │  │  │  ├─ MapView.tsx       # 地図表示(CSS transform の pan/zoom + ピンオーバーレイ、基図は実地理GeoJSON)
│  │  │  │  ├─ JoinForm.tsx      # 名前・階数入力
│  │  │  │  ├─ ShareButton.tsx   # URLコピー/共有
│  │  │  │  ├─ MemberList.tsx    # 参加者一覧(名前・階数・エリア/圏外)
│  │  │  │  ├─ FloorSelector.tsx # 建物(任意)+ 階数の手動選択(design/05)
│  │  │  │  ├─ AreaSwitcher.tsx  # 3エリア切替(駅×2 + キャンパス, 05)
│  │  │  │  ├─ CampusView.tsx    # 建物選択→階・教室のドリルダウン(05)
│  │  │  │  ├─ MeetingPointPicker.tsx # 集合場所指定(座標/メンバー/場所, 05)
│  │  │  │  ├─ PlaceSuggestions.tsx   # 空き教室候補の追加・一覧(05)
│  │  │  │  ├─ RoomVisibility.tsx     # public/private 切替(05)
│  │  │  │  └─ BottomSheet.tsx        # 汎用ボトムシート(design)
│  │  │  ├─ hooks/
│  │  │  │  ├─ useGeolocation.ts # watchPosition ラッパ
│  │  │  │  └─ useRoomSocket.ts  # WS接続・再接続・状態管理
│  │  │  ├─ lib/
│  │  │  │  ├─ coords.ts         # 緯度経度→マップ座標変換・resolveArea・クランプ(dev-docs §7/05)
│  │  │  │  ├─ areaGeo.ts        # GeoJSON→アフィン投影の共通生成(実地理化, #3)
│  │  │  │  ├─ campusGeo.ts / station1Geo.ts / station2Geo.ts  # 3エリアの投影データ
│  │  │  │  ├─ areaRegistry.ts   # AreaId→{geo,projection,size,bounds} レジストリ(#105)
│  │  │  │  ├─ mapAreas.ts       # エリア寸法・投影(coords が参照)
│  │  │  │  ├─ wire.ts           # WS 受信 dict → 内部型への変換
│  │  │  │  ├─ api.ts            # REST呼び出し
│  │  │  │  ├─ format.ts / campusData.ts   # 表示整形 / キャンパスマスタ整形
│  │  │  │  ├─ labels.ts         # メンバー・集合場所の表示ラベル生成(issue #165)
│  │  │  │  ├─ theme.ts / chipColors.ts    # 色トークン / 選択チップ色(#88)
│  │  │  │  └─ constants.ts      # throttle間隔などフロント定数(02)
│  │  │  ├─ data/               # OSM 由来 GeoJSON(campus/station1/station2, #3)
│  │  │  ├─ types/
│  │  │  │  ├─ messages.ts       # WS/RESTの型定義(serverと対応, 02)
│  │  │  │  └─ campus.ts         # MapArea/Building/Floor/教室/MeetingPoint(05)
│  │  │  ├─ pages/
│  │  │  │  ├─ TopPage.tsx       # "/" ルーム作成 + 公開ルーム導線
│  │  │  │  ├─ PublicRoomsPage.tsx # "/public" 公開ルーム一覧(design)
│  │  │  │  └─ RoomPage.tsx      # "/r/:roomId"(未参加=参加フォーム / 参加後=地図)
│  │  │  ├─ state/              # 状態機械と派生値(リファクタ #88)
│  │  │  │  ├─ RoomEngine.ts     # 中核の状態機械(renderVals はセレクタのスプレッド合成)
│  │  │  │  ├─ RoomContext.tsx   # useSyncExternalStore で React にブリッジ
│  │  │  │  ├─ MapGestureController.ts / SheetController.ts  # 地図ジェスチャ / シート操作
│  │  │  │  ├─ RoomSocketHandler.ts # WS 受信処理(サーバー → 状態反映。issue #164)
│  │  │  │  └─ selectors/        # renderVals の派生値(mapVals / sheetVals / topVals)
│  │  │  ├─ App.tsx              # ルーティング
│  │  │  └─ main.tsx             # エントリ
│  │  ├─ tests/                  # または各 *.test.ts を隣接配置
│  │  ├─ index.html
│  │  ├─ vite.config.ts          # server.proxy で /api /ws を :8000 へ(dev-docs §9)
│  │  ├─ tsconfig.json
│  │  ├─ eslint.config.js
│  │  ├─ .prettierrc
│  │  ├─ package.json
│  │  └─ package-lock.json
│  │
│  └─ server/                    # Python + FastAPI
│     ├─ app/
│     │  ├─ __init__.py
│     │  ├─ main.py              # create_app() ファクトリ + app 生成(#87 でリファクタ)
│     │  ├─ routes/              # APIRouter 分割(#87、旧 main.py のルートを移設)
│     │  │  ├─ meta.py           # GET /api/config・/api/health
│     │  │  ├─ rooms.py          # POST/GET/PATCH /api/rooms*
│     │  │  ├─ campus.py         # GET /api/campus
│     │  │  ├─ ws.py             # WS /ws/{id}(accept→establish_join→ループ→cleanup の薄い層)
│     │  │  └─ spa.py            # SPA / 静的ファイル fallback
│     │  ├─ config.py            # 設定/定数(TTL等)一元管理(02, 担当:ホスト)
│     │  ├─ rooms.py             # ルーム作成・取得・有効期限・serialize(担当:初心者A)
│     │  ├─ expiry.py            # 期限チェック・掃除タスク(担当:初心者B) ※rooms.pyに含めても可
│     │  ├─ ws.py               # ConnectionManager(担当:ホスト)
│     │  ├─ handlers.py          # WS処理 join確立/各メッセージ/切断cleanup(担当:初心者C)
│     │  ├─ campus.py            # 建物/教室マスタ読込・GET /api/campus(担当:初心者B, 05)
│     │  └─ models.py            # Pydanticモデル(client/server メッセージ・RoomStateMsg 等の型付き server→client・MsgType)
│     ├─ data/                   # キャンパスマスタ(05)
│     │  ├─ buildings.json       # 建物→階→教室 + SVGクリック領域・ランドマーク
│     │  └─ classrooms.csv       # 空き教室マスタ(当面は手入力)
│     ├─ tests/
│     │  ├─ test_rooms.py
│     │  ├─ test_expiry.py
│     │  ├─ test_config.py
│     │  └─ test_ws.py         # join/position/floor/meeting_point/place/leave/不正 の回帰
│     ├─ static/                 # web ビルド成果物の配置先(本番, .gitignore対象)
│     │  └─ .gitkeep
│     ├─ pyproject.toml          # ruff/pytest設定
│     ├─ requirements.txt        # 実行依存
│     └─ requirements-dev.txt    # ruff, pytest, mypy 等(03)
│
├─ .github/                      # → 03 CI/CD, 04 テンプレート で作成
│  ├─ workflows/
│  │  ├─ web-ci.yml
│  │  ├─ server-ci.yml
│  │  └─ deploy.yml              # 任意(後回し可)
│  ├─ ISSUE_TEMPLATE/
│  │  ├─ bug_report.yml
│  │  ├─ feature_request.yml
│  │  ├─ task.yml
│  │  └─ config.yml
│  ├─ pull_request_template.md
│  ├─ CODEOWNERS
│  └─ dependabot.yml             # 任意
│
├─ deploy/                       # 任意:デプロイ資材(03)
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  └─ Caddyfile                  # リバースプロキシ(自動HTTPS)例
│
├─ docs/                         # 本ドキュメント群
├─ scripts/                      # 任意:開発補助スクリプト(起動・整形等)
├─ .gitignore
├─ .editorconfig                 # 任意:改行/インデント統一
├─ CONTRIBUTING.md               # 開発フロー(04)
└─ README.md                     # 起動手順・リンク集(トップ)
```

> **なぜ `apps/web` `apps/server` か**:トップレベルに `frontend/` `backend/` を並べると「2つの対等なアプリ」に見えるが、実体は「FastAPIが1つのSPAを配信する1アプリ」。コードを `apps/` にまとめることでトップレベルは `apps / docs / deploy / .github` のみとなり、意図が伝わりやすい。`apps/` は Turborepo/Nx 等のモノレポで一般的な名前で、`src/web/src` のような `src` の重複も避けられる。Node と Python のツールチェーンは `apps/web` / `apps/server` 各ディレクトリで独立させる。
>
> `apps/server/app/expiry.py` と `handlers.py` は dev-docs §3 には無い分割案(**担当ごとにファイルを分けコンフリクトを避ける**狙い)。不要なら `rooms.py` / `ws.py` に統合してよい。

## 主要ディレクトリの責務

| パス | 責務 | 担当 |
|---|---|---|
| `apps/web/src/components/` | 表示部品。ロジックはhooks/libへ寄せる | ホスト |
| `apps/web/src/hooks/` | 位置取得・WS接続の副作用管理 | ホスト |
| `apps/web/src/lib/coords.ts` / `mapAreas.ts` | 座標変換(エリア別・要ユニットテスト, [02](./02_technical-design.md)/[05](./05_feature-design.md)) | ホスト |
| `apps/web/public/map/` | 実地理に忠実な自作マップSVG(3エリア) | ホスト(作画) |
| `apps/web/src/components/CampusView.tsx` | 建物→階→教室のドリルダウン([05](./05_feature-design.md)) | ホスト |
| `apps/server/app/rooms.py` | ルーム作成/取得/`room_id`発行・公開範囲・`host_token`([05](./05_feature-design.md)) | 初心者A |
| `apps/server/app/expiry.py` | `expires_at`チェック・掃除タスク | 初心者B |
| `apps/server/app/campus.py` / `data/` | 建物/教室マスタ読込・`GET /api/campus`([05](./05_feature-design.md)) | 初心者B |
| `apps/server/app/handlers.py` | WSメッセージ処理(退出・集合場所3タイプ・空き教室) | 初心者C |
| `apps/server/app/main.py` / `routes/` / `ws.py` / `config.py` | ルーティング(`create_app`+APIRouter)・WS骨格・設定 | ホスト |

## 命名規約

- **Reactコンポーネント**:`PascalCase.tsx`(1ファイル1コンポーネント)
- **hooks**:`useXxx.ts`
- **その他TSモジュール**:`camelCase.ts`
- **Pythonモジュール**:`snake_case.py`、関数/変数も `snake_case`
- **テスト**:web は `Xxx.test.ts(x)`、server は `test_xxx.py`

## .gitignore(ルート・全体)

```gitignore
# OS
.DS_Store

# Node / web
node_modules/
apps/web/dist/
*.local

# Python / server
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/

# ビルド成果物の配置先(本番でコピーするため追跡しない)
apps/server/static/*
!apps/server/static/.gitkeep

# env / secrets
.env
.env.*
!.env.example

# editor
.vscode/
.idea/
```

## TODO

> 現状の詳細は [06 実装ステータス §4.1/§4.2](./06_implementation-status.md)。

- [x] ルート `.gitignore` を上記内容で作成(`.DS_Store` は追跡外・ignore 済み)
- [x] `apps/web/` を Vite + React + TS で初期化
- [x] `apps/web/src/` 配下にディレクトリ(components/hooks/lib/types/**state**/pages)を作成(空スタブではなく**実装済み**)
- [x] `apps/web/public/map/` の3エリアSVG置き場 → **不採用**:`src/data/*.geojson.json`(OSM)を `src/components/map/AreaSvg.tsx` で実地理描画([06 §2](./06_implementation-status.md))
- [x] `apps/web/vite.config.ts` に `server.proxy`(`/api`・`/ws`, `ws:true`)を設定
- [x] `apps/server/app/` に `__init__.py` と各モジュール(`main/config/rooms/expiry/ws/handlers/campus/models`)を作成(実装済み)。リファクタ(#87)で REST/WS を `app/routes/*` の APIRouter に分割
- [x] `apps/server/data/` に `buildings.json` / `classrooms.csv` を配置
- [x] `apps/server/requirements.txt`(fastapi, uvicorn[standard], pydantic, pydantic-settings)を作成
- [x] `apps/server/static/.gitkeep` を作成
- [x] `apps/server/tests/` にテスト(rooms/expiry/ws/config)を配置
- [x] `.editorconfig` を作成
- [x] `README.md` に「起動手順・ディレクトリ概要・docsへのリンク」を追記
- [x] `.github/` ディレクトリを [03](./03_cicd.md) / [04](./04_github-templates.md) で作成
- [x] `deploy/` を [03](./03_cicd.md) で作成(Caddyは不採用)

### 完了の目安(Gate)

✅ 達成:`apps/web/` `apps/server/` の骨格(=実装)が置かれ、`.gitignore` が有効で、`uvicorn app.main:app --reload` と `npm run dev` が起動できる。
※ サーバーは **Python 3.12** が必要(`uv venv --python 3.12`。詳細は README)。
