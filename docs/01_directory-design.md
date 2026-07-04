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
│  │  │  └─ map/                 # 自作マップSVG(3エリア, 05)
│  │  │     ├─ station-1.svg     # 国際展示場駅
│  │  │     ├─ station-2.svg     # 東京テレポート駅
│  │  │     └─ campus.svg        # 有明キャンパス(建物クリック領域つき)
│  │  ├─ src/
│  │  │  ├─ components/          # 表示コンポーネント
│  │  │  │  ├─ MapView.tsx       # Leaflet地図・ピン描画
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
│  │  │  │  ├─ coords.ts         # 緯度経度→マップ座標変換(エリア別, dev-docs §7/05)
│  │  │  │  ├─ mapAreas.ts       # 3エリアのSVG・キャリブレーション定義(05)
│  │  │  │  ├─ api.ts            # REST呼び出し
│  │  │  │  └─ constants.ts      # throttle間隔などフロント定数(02)
│  │  │  ├─ types/
│  │  │  │  ├─ messages.ts       # WS/RESTの型定義(serverと対応, 02)
│  │  │  │  └─ campus.ts         # MapArea/Building/Floor/教室/MeetingPoint(05)
│  │  │  ├─ pages/
│  │  │  │  ├─ TopPage.tsx       # "/" ルーム作成 + 公開ルーム導線
│  │  │  │  ├─ PublicRoomsPage.tsx # "/public" 公開ルーム一覧(design)
│  │  │  │  └─ RoomPage.tsx      # "/r/:roomId"(未参加=参加フォーム / 参加後=地図)
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
│     │  ├─ main.py              # FastAPIエントリ・静的配信・ルーティング(担当:ホスト)
│     │  ├─ config.py            # 設定/定数(TTL等)一元管理(02, 担当:ホスト)
│     │  ├─ rooms.py             # ルーム作成・取得・有効期限(担当:初心者A)
│     │  ├─ expiry.py            # 期限チェック・掃除タスク(担当:初心者B) ※rooms.pyに含めても可
│     │  ├─ ws.py               # WSエンドポイント・ConnectionManager骨格(担当:ホスト)
│     │  ├─ handlers.py          # WSメッセージ処理 join/floor/退出/集合場所/空き教室(担当:初心者C)
│     │  ├─ campus.py            # 建物/教室マスタ読込・GET /api/campus(担当:初心者B, 05)
│     │  └─ models.py            # Pydanticモデル(メッセージ定義)
│     ├─ data/                   # キャンパスマスタ(05)
│     │  ├─ buildings.json       # 建物→階→教室 + SVGクリック領域・ランドマーク
│     │  └─ classrooms.csv       # 空き教室マスタ(当面は手入力)
│     ├─ tests/
│     │  ├─ test_rooms.py
│     │  ├─ test_expiry.py
│     │  └─ test_ws.py
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
| `apps/server/app/ws.py` / `main.py` / `config.py` | 骨格・配信・設定 | ホスト |

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

- [ ] ルート `.gitignore` を上記内容で作成(担当:ホスト) ※`.DS_Store` が現在追跡外か確認し、必要なら `git rm --cached`
- [ ] `apps/web/` を Vite + React + TS で初期化(`npm create vite@latest apps/web -- --template react-ts`)(担当:ホスト)
- [ ] `apps/web/src/` 配下に上記ディレクトリ(components/hooks/lib/types/pages)を作成し、各ファイルの空スタブを配置(担当:ホスト)
- [ ] `apps/web/public/map/` に3エリアSVGの置き場を用意(`.gitkeep`、SVG作画は[05](./05_feature-design.md))(担当:ホスト)
- [ ] `apps/web/vite.config.ts` に `server.proxy`(`/api`・`/ws`, `ws:true`)を設定([dev-docs §9](./imasoko-dev-docs.md))(担当:ホスト)
- [ ] `apps/server/app/` に `__init__.py` と各モジュールの空スタブ(`main/config/rooms/expiry/ws/handlers/campus/models`)を作成(担当:ホスト)
- [ ] `apps/server/data/` に `buildings.json` / `classrooms.csv` の雛形を配置([05](./05_feature-design.md))(担当:初心者B)
- [ ] `apps/server/requirements.txt`(fastapi, uvicorn[standard], pydantic, pydantic-settings)を作成(担当:ホスト)
- [ ] `apps/server/static/.gitkeep` を作成(担当:ホスト)
- [ ] `apps/server/tests/` に空テストファイルを配置(担当:各自)
- [ ] `.editorconfig` を作成(任意)(担当:ホスト)
- [ ] `README.md` に「起動手順・ディレクトリ概要・docsへのリンク」を追記(担当:ホスト)
- [ ] `.github/` ディレクトリは [03](./03_cicd.md) / [04](./04_github-templates.md) で作成
- [ ] `deploy/` は [03](./03_cicd.md) で作成(後回し可)

### 完了の目安(Gate)

`apps/web/` `apps/server/` の骨格が置かれ、`.gitignore` が有効で、`uvicorn app.main:app --reload`(`apps/server` 内)と `npm run dev`(`apps/web` 内)が(中身は空でも)起動できる状態。
