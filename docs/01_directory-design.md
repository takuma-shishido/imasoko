# 01 ディレクトリ設計

関連:[00_overview](./00_overview.md) / [imasoko-dev-docs §3](./imasoko-dev-docs.md)

開発ドキュメント §3 の構成案を、CI/CD・テスト・テンプレート・デプロイまで含めた**リポジトリ全体構成**に拡張する。目的は「誰がどこを触るか」を一意に決め、初心者3人が迷わず並行作業できるようにすること。

## 方針

- **モノレポ**:`frontend/` と `backend/` を1リポジトリに置く。小規模チーム・同時デプロイのため分割しない
- **同一オリジン配信**:本番は React ビルド成果物を FastAPI の `StaticFiles` で配信(CORS不要、[dev-docs §1](./imasoko-dev-docs.md))
- **責務の分離**:1ファイル1責務。特に backend は担当者ごとにファイルを分け、コンフリクトを避ける
- **設定は一元化**:マジックナンバー(TTL・throttle等)は定数モジュール1箇所に集約([02](./02_technical-design.md))

## リポジトリ全体構成

```
imasoko/
├─ .github/                      # → 03 CI/CD, 04 テンプレート で作成
│  ├─ workflows/
│  │  ├─ frontend-ci.yml
│  │  ├─ backend-ci.yml
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
├─ frontend/
│  ├─ public/
│  │  └─ map/                    # 自作キャンパスマップ画像(SVG/PNG)
│  │     └─ .gitkeep
│  ├─ src/
│  │  ├─ components/             # 表示コンポーネント
│  │  │  ├─ MapView.tsx          # Leaflet地図・ピン描画
│  │  │  ├─ JoinForm.tsx         # 名前・階数入力
│  │  │  ├─ ShareButton.tsx      # URLコピー/共有
│  │  │  ├─ MemberList.tsx       # 参加者一覧(圏外者もここに)
│  │  │  └─ FloorSelector.tsx    # 階数の手動選択
│  │  ├─ hooks/
│  │  │  ├─ useGeolocation.ts    # watchPosition ラッパ
│  │  │  └─ useRoomSocket.ts     # WS接続・再接続・状態管理
│  │  ├─ lib/
│  │  │  ├─ coords.ts            # 緯度経度→マップ座標変換(dev-docs §7)
│  │  │  ├─ api.ts               # REST呼び出し
│  │  │  └─ constants.ts         # throttle間隔などフロント定数(02)
│  │  ├─ types/
│  │  │  └─ messages.ts          # WS/RESTの型定義(バックと対応, 02)
│  │  ├─ pages/
│  │  │  ├─ TopPage.tsx          # "/" ルーム作成
│  │  │  └─ RoomPage.tsx         # "/r/:roomId"
│  │  ├─ App.tsx                 # ルーティング
│  │  └─ main.tsx                # エントリ
│  ├─ tests/                     # または各 *.test.ts を隣接配置
│  ├─ index.html
│  ├─ vite.config.ts             # server.proxy で /api /ws を :8000 へ(dev-docs §9)
│  ├─ tsconfig.json
│  ├─ .eslintrc.cjs / eslint.config.js
│  ├─ .prettierrc
│  ├─ package.json
│  └─ package-lock.json
│
├─ backend/
│  ├─ app/
│  │  ├─ __init__.py
│  │  ├─ main.py                 # FastAPIエントリ・静的配信・ルーティング(担当:ホスト)
│  │  ├─ config.py               # 設定/定数(TTL等)一元管理(02, 担当:ホスト)
│  │  ├─ rooms.py                # ルーム作成・取得・有効期限(担当:初心者A)
│  │  ├─ expiry.py               # 期限チェック・掃除タスク(担当:初心者B) ※rooms.pyに含めても可
│  │  ├─ ws.py                   # WSエンドポイント・ConnectionManager骨格(担当:ホスト)
│  │  ├─ handlers.py             # WSメッセージ処理関数 join/floor等(担当:初心者C)
│  │  └─ models.py               # Pydanticモデル(メッセージ定義)
│  ├─ tests/
│  │  ├─ test_rooms.py
│  │  ├─ test_expiry.py
│  │  └─ test_ws.py
│  ├─ static/                    # ビルド成果物の配置先(本番, .gitignore対象)
│  │  └─ .gitkeep
│  ├─ pyproject.toml             # ruff/pytest設定(または setup.cfg)
│  ├─ requirements.txt           # 実行依存
│  └─ requirements-dev.txt       # ruff, pytest, mypy 等(03)
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
└─ README.md                     # 起動手順・リンク集(トップ)
```

> `backend/app/expiry.py` と `handlers.py` は dev-docs §3 には無い分割案。**担当者ごとにファイルを分けてコンフリクトを避ける**のが狙い。チームで不要と判断すれば `rooms.py` / `ws.py` に統合してよい。

## 主要ディレクトリの責務

| パス | 責務 | 担当 |
|---|---|---|
| `frontend/src/components/` | 表示部品。ロジックはhooks/libへ寄せる | ホスト |
| `frontend/src/hooks/` | 位置取得・WS接続の副作用管理 | ホスト |
| `frontend/src/lib/coords.ts` | 座標変換(要ユニットテスト, [02](./02_technical-design.md)) | ホスト |
| `frontend/public/map/` | 実地理に忠実な自作マップ画像 | 要担当決め(dev-docs §12) |
| `backend/app/rooms.py` | ルーム作成/取得/`room_id`発行 | 初心者A |
| `backend/app/expiry.py` | `expires_at`チェック・掃除タスク | 初心者B |
| `backend/app/handlers.py` | WSメッセージ処理関数 | 初心者C |
| `backend/app/ws.py` / `main.py` / `config.py` | 骨格・配信・設定 | ホスト |

## 命名規約

- **Reactコンポーネント**:`PascalCase.tsx`(1ファイル1コンポーネント)
- **hooks**:`useXxx.ts`
- **その他TSモジュール**:`camelCase.ts`
- **Pythonモジュール**:`snake_case.py`、関数/変数も `snake_case`
- **テスト**:frontは `Xxx.test.ts(x)`、backは `test_xxx.py`

## .gitignore(ルート・全体)

```gitignore
# OS
.DS_Store

# Node / frontend
node_modules/
frontend/dist/
*.local

# Python / backend
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.ruff_cache/
.mypy_cache/

# ビルド成果物の配置先(本番でコピーするため追跡しない)
backend/static/*
!backend/static/.gitkeep

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
- [ ] `frontend/` を Vite + React + TS で初期化(`npm create vite@latest frontend -- --template react-ts`)(担当:ホスト)
- [ ] `frontend/src/` 配下に上記ディレクトリ(components/hooks/lib/types/pages)を作成し、各ファイルの空スタブを配置(担当:ホスト)
- [ ] `frontend/public/map/.gitkeep` を作成(画像は後日)(担当:ホスト)
- [ ] `frontend/vite.config.ts` に `server.proxy`(`/api`・`/ws`, `ws:true`)を設定([dev-docs §9](./imasoko-dev-docs.md))(担当:ホスト)
- [ ] `backend/app/` に `__init__.py` と各モジュールの空スタブ(`main/config/rooms/expiry/ws/handlers/models`)を作成(担当:ホスト)
- [ ] `backend/requirements.txt`(fastapi, uvicorn[standard], pydantic)を作成(担当:ホスト)
- [ ] `backend/static/.gitkeep` を作成(担当:ホスト)
- [ ] `backend/tests/` に空テストファイルを配置(担当:各自)
- [ ] `.editorconfig` を作成(任意)(担当:ホスト)
- [ ] `README.md` に「起動手順・ディレクトリ概要・docsへのリンク」を追記(担当:ホスト)
- [ ] `.github/` ディレクトリは [03](./03_cicd.md) / [04](./04_github-templates.md) で作成
- [ ] `deploy/` は [03](./03_cicd.md) で作成(後回し可)

### 完了の目安(Gate)

`frontend/` `backend/` の骨格が置かれ、`.gitignore` が有効で、`uvicorn app.main:app --reload` と `npm run dev` が(中身は空でも)起動できる状態。
