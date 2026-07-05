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

> **現行の構成は下記「[dev/本番の2環境デプロイ(issue #40)](#dev本番の2環境デプロイissue-40)」を参照。** 以下の Caddyfile / 単一環境 deploy.yml のスニペットは初期設計メモで、実際の `.github/workflows/deploy.yml`(2環境・Cloudflare+Tailscale 構成)とは一致しない。

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

## dev/本番の2環境デプロイ(issue #40)

`develop` / `main` の push を、それぞれ dev(検証)/ 本番 の 2 環境へ自動デプロイする。**同一オリジン配信**(REST は相対 `/api/...`、WS は `location` から wss 導出、`shareUrl()` も実オリジン生成)のため、**同一イメージが両ドメインでそのまま動く**(per-domain のビルド差分・CORS は不要)。1 台のコンテナホストに 2 スタックを共存させ、ポート番号・compose プロジェクト名・デプロイ先ディレクトリで分離する。

### 構成(TLS/公開層は Cloudflare + Tailscale)

```
[スマホ / ブラウザ]
   │ HTTPS(imasoko.reimpl.com / imasoko-dev.reimpl.com)
   ▼
[Cloudflare]  ── client↔サーバ間の SSL を終端(公開ドメインの TLS)
   │ HTTP
   ▼
[VPS: nginx]  ── TLS は終端しない。Tailscale 経由でコンテナホストへ HTTP proxy(WS の Upgrade/Connection を転送)
   │ HTTP over Tailscale
   ▼
[コンテナホスト(別ノード)]
   ├─ :8000  本番コンテナ(dir ~/imasoko     / -p imasoko     / main)
   └─ :8001  dev  コンテナ(dir ~/imasoko-dev / -p imasoko-dev / develop)
```

- origin は **HTTP** 配信。TLS は Cloudflare が担当(コンテナホスト側に nginx/certbot は不要)。
- VPS の nginx は TLS を終端せず、Cloudflare から受けた HTTP をコンテナホストの **Tailscale IP:8000 / :8001** へ振り分ける。
- WebSocket(`/ws`)は Cloudflare が WSS を透過し、VPS の nginx は `Upgrade` / `Connection` を転送する(WS 透過に必須)。
- **デプロイ経路は別**:GitHub Actions ランナー → `tailscale/github-action` で tailnet 参加 → コンテナホストの Tailscale IP へ SSH。リポジトリは CI から `tar` でコピー(ホストに git clone は不要)。下記「Tailscale 参加 + デプロイ」。

### 対応表

| ブランチ | ドメイン | dir | compose project | port | GitHub environment |
|---|---|---|---|---|---|
| `main` | imasoko.reimpl.com | `~/imasoko` | `imasoko` | 8000 | production |
| `develop` | imasoko-dev.reimpl.com | `~/imasoko-dev` | `imasoko-dev` | 8001 | develop |

### コンテナホスト側の準備(git clone 不要)

**ホスト側の手動セットアップは不要**。CI がチェックアウトしたリポジトリを `tar` でホストへコピーし、ホスト側で `docker compose up -d --build` する(デプロイ先 `~/imasoko` / `~/imasoko-dev` は CI が毎回作り直す)。ホストに必要なのは:

- **docker**(compose v2)/ **ssh(sshd)** / **tar** が入っていること
- デプロイ用の公開鍵が SSH ユーザーの `~/.ssh/authorized_keys` にあること
- Tailscale に参加済みで、`tag:ci` からの `22/tcp` 到達が ACL で許可されていること

> デプロイ先ディレクトリは**リポジトリのコピー置き場**にすぎず、位置状態を持たない(状態はコンテナのインメモリのみ・**1 ワーカー固定**、[02 §9](./02_technical-design.md))。毎回 `rm -rf` → 展開しても実行中コンテナには影響しない。compose プロジェクト名(`-p imasoko` / `-p imasoko-dev`)で 2 環境を分離する。
> 8000/8001 は **Tailscale 経由でのみ**到達させる想定。公開インターフェースには晒さない(ファイアウォールで塞ぐ)。

### VPS の nginx(TLS 終端なし・HTTP → Tailscale 転送)

Cloudflare が TLS を担うため、VPS の nginx は 80(HTTP)で受け、コンテナホストの Tailscale IP へ proxy する。WebSocket 透過のため `Upgrade` / `Connection` の転送が必須。

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

# 本番: imasoko.reimpl.com → <コンテナホストの Tailscale IP>:8000
server {
    listen 80;
    server_name imasoko.reimpl.com;
    location / {
        proxy_pass http://100.x.x.x:8000;       # ← コンテナホストの Tailscale IP に置き換える
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;       # WS 透過
        proxy_set_header Connection $connection_upgrade; # WS 透過
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;               # 長時間の WS 接続が切れないように
    }
}

# dev: imasoko-dev.reimpl.com → <コンテナホストの Tailscale IP>:8001
server {
    listen 80;
    server_name imasoko-dev.reimpl.com;
    location / {
        proxy_pass http://100.x.x.x:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

> Cloudflare 側は DNS で両ドメインを VPS へ向け(proxied / orange cloud)、SSL/TLS モードは **Flexible**(client↔CF は HTTPS、CF↔VPS は HTTP)にする。

### Tailscale 参加 + デプロイ(両環境共通の Secrets)

GitHub-hosted ランナーは Tailscale 網の外にいるため、`deploy.yml` は [`tailscale/github-action@v4`](https://github.com/tailscale/github-action) で**ランナーを tailnet に一時参加**させ(ephemeral node)、コンテナホストの **Tailscale IP** へネイティブ `ssh` で接続する。ホストに git clone は不要で、**CI がチェックアウトしたリポジトリを `tar` でホストへコピー**(`.git`/`node_modules`/`dist` 除外)→ ホストで `docker compose -f deploy/docker-compose.yml up -d --build` する。ブランチで dir/project/port を出し分けるため、Secrets は環境共通で使う。

> `appleboy/ssh-action` は Docker コンテナ内で動き、ランナーの `tailscale0` へのルーティングが不安定なため、ネイティブ `ssh` の `run:` ステップ(ランナーホスト上で直接実行)を採用している。

**Tailscale 側の準備**:

1. 管理コンソール → **Settings → OAuth clients** で client を作成(スコープ `Devices Core` の write、タグ `tag:ci`)。発行された client id / secret を控える。
2. ACL の `tagOwners` に `tag:ci` を追加し、`tag:ci` からコンテナホストへ `22/tcp`(SSH)到達を許可する grant を入れる。
3. コンテナホストが tailnet に参加済みで sshd が動いていること。

**Secrets 登録**(`gh secret set` または Settings → Secrets → Actions):

```bash
gh secret set DEPLOY_HOST          # コンテナホストの Tailscale IP(100.x)または MagicDNS 名
gh secret set DEPLOY_USER          # SSH ユーザ
gh secret set DEPLOY_SSH_KEY       # 秘密鍵(対応する公開鍵をコンテナホストの ~/.ssh/authorized_keys に追加)
gh secret set TS_OAUTH_CLIENT_ID   # Tailscale OAuth client id
gh secret set TS_OAUTH_SECRET      # Tailscale OAuth client secret
```

> `DEPLOY_HOST` 未登録の間は Tailscale / SSH ステップが `if: secrets.DEPLOY_HOST != ''` で無害にスキップされ、代わりに warning が出る。GitHub Environments(production / develop)で Secrets を分けるのは任意(分ける場合は develop 環境にも同じ 5 つを登録)。

### 実機確認(最優先)

- [ ] スマホ(HTTPS)で `https://imasoko.reimpl.com` / `https://imasoko-dev.reimpl.com` が開く
- [ ] 位置情報の許可 → 地図に自分が表示される
- [ ] WSS(位置共有)が疎通(別端末を join → 互いの位置が更新される)
- [ ] 共有リンクから再参加できる
- [ ] 2 環境が独立(片方でルーム作成 → もう片方に現れない)

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

> 実際に採用した値は本文の設計スニペットと一部異なる(例:web `build` は `tsc --noEmit && vite build`、`requirements-dev` は `>=` 指定、status check job 名は `build`/`test`)。現状は [06 実装ステータス §4.3](./06_implementation-status.md) を参照。

- [x] `apps/web/package.json` に scripts(`lint`/`typecheck`/`format`/`format:check`/`test`/`build`)を追加
- [x] Prettier / ESLint(flat config)の設定ファイルを追加
- [x] `apps/server/requirements-dev.txt` と `apps/server/pyproject.toml`(ruff/pytest)を作成
- [x] `.github/workflows/web-ci.yml` を作成
- [x] `.github/workflows/server-ci.yml` を作成
- [ ] ダミーPRを1本作り、両CIが緑になることを確認(GitHub上・未)
- [ ] `main` ブランチ保護を有効化(status checks `build`/`test`、レビュー1)
- [x] `deploy/Dockerfile` / `docker-compose.yml` を作成(**Caddyfile は不採用**、リバースプロキシは各自運用。host port は `APP_PORT` で可変・issue #40)
- [x] 自動デプロイ `deploy.yml` を **develop/main の2環境**へ出し分け(issue #40。dev→8001 / 本番→8000、TLS/公開は Cloudflare + Tailscale。手順は上記「dev/本番の2環境デプロイ」)
- [ ] コンテナホストに docker/ssh/tar + 公開鍵 + Tailscale(`tag:ci`→:22 ACL)を用意(**git clone 不要**・CI が tar コピー)+ VPS nginx 転送 + Tailscale OAuth client 作成 + **Secrets 登録**(`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`/`TS_OAUTH_CLIENT_ID`/`TS_OAUTH_SECRET`)を運用者側で実施
- [ ] スマホ実機で両ドメインの **HTTPS + WSS疎通**を確認(最優先)
- [ ] mypy を `continue-on-error` から必須へ格上げ(型が整ってきたら)
