# 03 CI/CD整備

関連:[00_overview](./00_overview.md) / [01 ディレクトリ設計](./01_directory-design.md) / [04 GitHubテンプレート](./04_github-templates.md)

目的:**PRごとに品質ゲート(Lint/Format/型/テスト/ビルド)を自動で回し**、初心者3人が安心してマージできる状態を作る。CD(デプロイ)は個人サーバー運用のため、まずは手動手順 + 任意の自動化として設計する。

## 方針

- モノレポなので**path filter**で「触った側だけ」CIを回す(`apps/web` 変更で server CIは走らせない)
- `concurrency` で古い実行をキャンセルし、無料枠を節約
- 依存キャッシュ(npm / pip)でCI高速化
- **まずCIの器を空でも通る状態で先に入れる**([00 フェーズ0](./00_overview.md))→ 以降のPRで自動的にゲートが効く

## ツール選定

| 対象 | ツール | コマンド | 備考 |
|---|---|---|---|
| web Lint | ESLint | `npm run lint` | Vite react-ts テンプレに同梱 |
| web 整形 | Prettier | `npm run format:check` | 差分チェックのみCIで実行 |
| web 型 | TypeScript | `npm run typecheck`(`tsc --noEmit`) | |
| web テスト | Vitest | `npm test`(`vitest run`) | 無い間は `--if-present` でスキップ |
| web ビルド | Vite | `npm run build` | 壊れていないことの担保 |
| server Lint+整形 | **Ruff** | `ruff check .` / `ruff format --check .` | black+flake8+isort を1つで代替、高速 |
| server 型 | mypy | `mypy app` | 最初は `continue-on-error` で緩く |
| server テスト | pytest | `pytest -q` | [02 §8](./02_technical-design.md) |

### 必要な `apps/web/package.json` scripts

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run"
  }
}
```

### `apps/server/requirements-dev.txt`

```
ruff==0.6.*
pytest==8.*
httpx==0.27.*
mypy==1.*
```

### `apps/server/pyproject.toml`(Ruff/pytest設定・抜粋)

```toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]   # pycodestyle, pyflakes, isort, pyupgrade, bugbear

[tool.pytest.ini_options]
addopts = "-q"
testpaths = ["tests"]
```

---

## CI: `.github/workflows/web-ci.yml`

```yaml
name: web-ci

on:
  pull_request:
    paths: ["apps/web/**", ".github/workflows/web-ci.yml"]
  push:
    branches: [main]
    paths: ["apps/web/**", ".github/workflows/web-ci.yml"]

concurrency:
  group: web-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test --if-present
      - run: npm run build
```

## CI: `.github/workflows/server-ci.yml`

```yaml
name: server-ci

on:
  pull_request:
    paths: ["apps/server/**", ".github/workflows/server-ci.yml"]
  push:
    branches: [main]
    paths: ["apps/server/**", ".github/workflows/server-ci.yml"]

concurrency:
  group: server-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/server
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: apps/server/requirements*.txt
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: ruff format --check .
      - name: mypy (型チェック・当面は非ブロッキング)
        run: mypy app
        continue-on-error: true
      - run: pytest -q
```

> **ポイント**:テストが1件も無い初期でも、Lint/Format/Buildは通るので「空でも緑」の状態を先に作れる。テストは書いた分だけ効いてくる。

---

## CD(デプロイ)

個人サーバー運用([dev-docs §10](./imasoko-dev-docs.md))。**まず手動デプロイを確立**し、余裕があれば自動化する。ハッカソン当日までにHTTPS/WSSの疎通確認を最優先。

### パッケージング:`deploy/Dockerfile`(マルチステージ・同一オリジン配信)

```dockerfile
# 1) web をビルド
FROM node:20-slim AS front
WORKDIR /front
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build            # → /front/dist

# 2) server + 静的配信
FROM python:3.12-slim AS app
WORKDIR /app
COPY apps/server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/server/ ./
COPY --from=front /front/dist ./static      # FastAPI StaticFiles で配信
EXPOSE 8000
# 位置状態はインメモリのため 1 ワーカー固定([02 §9](../docs/02_technical-design.md))
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### リバースプロキシ:`deploy/Caddyfile`(自動HTTPS・WS透過)

Caddy は Let's Encrypt を自動取得し、WebSocket も追加設定なしで透過するため、ハッカソンの個人サーバーに最適。

```caddyfile
imasoko.example.com {
    reverse_proxy localhost:8000
}
```

> nginx を使う場合は `/ws` に対し `Upgrade` / `Connection` ヘッダーの転送設定が必要([dev-docs §10](./imasoko-dev-docs.md))。**443で公開**(デモ会場のWi-Fi対策)。

### `deploy/docker-compose.yml`(例)

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: deploy/Dockerfile
    restart: unless-stopped
    ports: ["8000:8000"]        # Caddy/リバプロ経由で443へ
```

### 手動デプロイ手順(最小)

1. サーバーに `git pull`
2. `docker compose -f deploy/docker-compose.yml up -d --build`(または `apps/web` で `npm run build` → `apps/server/static/` へコピー → `uvicorn` を systemd 再起動)
3. Caddy/リバースプロキシで 443 → 8000 を中継、TLS終端
4. スマホ実機で `https://<ドメイン>/` を開き、**位置許可 + WSS疎通**を確認

### 自動デプロイ:`.github/workflows/deploy.yml`(任意・後回し可)

`main` push で SSH デプロイする例。**Secrets が揃っている時だけ動く**ようガードし、無ければ無害にスキップ。

```yaml
name: deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: SSH deploy
        if: ${{ secrets.DEPLOY_HOST != '' }}
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd ~/imasoko
            git pull --ff-only
            docker compose -f deploy/docker-compose.yml up -d --build
```

必要 Secrets(Settings → Secrets → Actions):`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`。

## ブランチ保護(CIを必須ゲートにする)

CIワークフローが1度でも走った後、`gh` で設定できる(`main` 対象)。詳細な運用ルールは [04](./04_github-templates.md)。

```bash
gh api -X PUT repos/{owner}/imasoko/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[checks][][context]=build' \
  -f 'required_status_checks[checks][][context]=test' \
  -F 'enforce_admins=false' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null'
```

> GUIの方が簡単:Settings → Branches → Add rule → `main` に「Require PR before merging(承認1)」「Require status checks(`build`, `test`)」を有効化。

## TODO

- [ ] `apps/web/package.json` に上記 scripts を追加(担当:ホスト)
- [ ] Prettier / ESLint の設定ファイルを追加(Viteテンプレのeslintを流用可)(担当:ホスト)
- [ ] `apps/server/requirements-dev.txt` と `apps/server/pyproject.toml`(ruff/pytest)を作成(担当:ホスト)
- [ ] `.github/workflows/web-ci.yml` を作成(担当:ホスト)
- [ ] `.github/workflows/server-ci.yml` を作成(担当:ホスト)
- [ ] ダミーPRを1本作り、両CIが緑になることを確認(担当:ホスト)
- [ ] `main` ブランチ保護を有効化(status checks `build`/`test`、レビュー1)(担当:ホスト)
- [ ] `deploy/Dockerfile` / `docker-compose.yml` / `Caddyfile` を作成(担当:デプロイ担当=ホスト, 後回し可)
- [ ] サーバーで手動デプロイを一度成功させ、**HTTPS + WSS疎通を実機確認**(担当:サーバー運用者, 最優先)
- [ ] 自動デプロイ `deploy.yml` + Secrets 登録(任意)(担当:ホスト)
- [ ] mypy を `continue-on-error` から必須へ格上げ(型が整ってきたら)(担当:ホスト)
