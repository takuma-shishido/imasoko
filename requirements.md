# 環境構築(macOS)

「いまそこ」を Mac で開発するためのセットアップ手順。作業フロー・規約は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

> このガイドは **uv は導入済み** を前提にしています。フロントエンド(Node.js)側は未セットアップの想定で、そちらを手厚めに書いています。

## 必要なツール

| ツール | バージョン | 用途 | 導入 |
|---|---|---|---|
| **uv** | 0.9+ | Python 3.12 の仮想環境・依存管理(server) | ✅ 導入済み |
| **Node.js** | **20 (LTS)** | フロント(apps/web)のビルド・テスト。**CI は Node 20** | 下記 §2 |
| **Git** | 2.x | バージョン管理 | 標準 / `brew install git` |
| (任意)Homebrew | — | Node 等のインストールに便利 | https://brew.sh |

- **Python** は uv が 3.12 を用意するため、システムに別途入れる必要はありません。
- macOS 標準の `python3` は 3.9 で **サーバーは動きません**(→ §3 の注意)。

---

## 1. リポジトリの取得

```bash
git clone https://github.com/takuma-shishido/imasoko 
cd imasoko
```

---

## 2. フロントエンド(apps/web / React + TypeScript / Vite)

### 2-1. Node.js 20 を入れる(未実施)

CI と同じ **Node 20(LTS)** を推奨します。バージョンを固定できる **nvm** が安全です。

**方法A:nvm(推奨・CI と同じ 20 に固定できる)**

```bash
brew install nvm
mkdir -p ~/.nvm
# ~/.zshrc に以下を追記(初回のみ):
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "$(brew --prefix nvm)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"
# 追記後、新しいターミナルを開くか `source ~/.zshrc`

nvm install 20
nvm use 20
```

**方法B:Homebrew(手軽・最新LTS)**

```bash
brew install node        # 最新LTS が入る
```

確認:

```bash
node --version   # v20.x（20以上ならOK。CI は 20）
npm --version
```

> 既に Node が入っている場合、**20 以上**なら動きます(実績:24 でもビルド可)。厳密に CI を再現したいときは nvm で 20 に合わせてください。

### 2-2. 依存インストールと起動

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173
```

- フロントは**シミュレーションで自走**するため、バックエンドが無くても全画面を確認できます(右下の DEMO チップで状態切替)。

### 2-3. チェック(= CI と同じ)

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

---

## 3. バックエンド(apps/server / FastAPI)

Python **3.12** が必須です。uv で 3.12 の仮想環境を作ります(システムの 3.9 は使いません)。

```bash
cd apps/server
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
```

起動 / テスト:

```bash
source .venv/bin/activate            # 以降このターミナルで有効

uvicorn app.main:app --reload        # http://localhost:8000
pytest -q                            # rooms / expiry / ws の最小テスト
```

チェック(= CI と同じ):

```bash
ruff check .
ruff format --check .
mypy app                             # 型チェック(当面は非ブロッキング)
```

> `source` せずに使う場合は各コマンドを `.venv/bin/uvicorn …` / `.venv/bin/pytest …` のように直接叩いてもOK。

---

## 4. 両方を同時に動かす(実接続の確認)

- ターミナル①:`cd apps/server && source .venv/bin/activate && uvicorn app.main:app --reload`(:8000)
- ターミナル②:`cd apps/web && npm run dev`(:5173)

開発時は Vite の `server.proxy` が `/api`・`/ws` を `:8000` へ転送します(dev-docs §9)。ブラウザは **:5173** を開きます。

---

## 5. よくあるハマり

| 症状 | 原因 / 対処 |
|---|---|
| `pip install` / `pytest` で構文エラーや依存が入らない | システム `python3`(3.9)を使っている。**必ず `.venv`(3.12)** を有効化する(§3) |
| `uv venv --python 3.12` で 3.12 が無いと言われる | uv が自動DLする。ネットワーク不可なら `brew install python@3.12` 後に再実行 |
| `npm run dev` で古い挙動 / ビルド差異 | Node のバージョン違い。`node -v` を確認し、nvm で **20** に合わせる(§2-1) |
| スマホ実機で位置情報が取れない | Geolocation は **HTTPS 必須**(`localhost` のみ例外)。cloudflared / ngrok で HTTPS 公開して確認(dev-docs §9) |
