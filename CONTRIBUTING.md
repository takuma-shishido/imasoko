# コントリビュートガイド(いまそこ)

チームで同じルール・同じ書式で開発するためのガイド。詳細な設計は [docs/](./docs/00_overview.md) を参照。

## 開発の流れ

1. Issue を作る(または割り当てられた Issue を確認)
2. ブランチを切る:`<type>/<scope>-<short>`(命名規約は下記)
3. 実装 → ローカルで動作確認(front: `npm run dev` / back: `uvicorn app.main:app --reload`)
4. PR を出す(テンプレートに沿って記入、`Closes #<Issue番号>`)
5. CI が緑・レビュー承認1件でマージ(**Squash and merge**)

## セットアップ

### web(React + TypeScript / Vite)

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173
```

チェック:`npm run lint` / `npm run typecheck` / `npm run format:check` / `npm test` / `npm run build`(= CI と同じ)。

### server(FastAPI)

Python 3.12+ が必要(`requirements` は 3.12 前提)。`uv` があれば以下が簡単:

```bash
cd apps/server
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
./.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000
```

チェック:`ruff check .` / `ruff format --check .` / `pytest -q`(= CI と同じ)。

### 実機テスト

Geolocation は HTTPS 必須(`localhost` のみ例外)。スマホ実機は cloudflared / ngrok 等で HTTPS 公開して確認する(dev-docs §9)。

## ブランチ命名

`<type>/<scope>-<short-desc>`

| type    | 用途           | 例                  |
| ------- | -------------- | ------------------- |
| `feat`  | 機能追加       | `feat/rooms-api`    |
| `fix`   | バグ修正       | `fix/ws-reconnect`  |
| `docs`  | ドキュメント   | `docs/coords-note`  |
| `chore` | 設定・雑務     | `chore/ci-setup`    |

## コミットメッセージ(Conventional Commits)

```
<type>(<scope>): <要約>

例:
feat(rooms): ルーム作成APIとroom_id発行を実装
fix(ws): 切断時にmember_leftをブロードキャストするよう修正
```

`type` は英語、要約は日本語で OK。1コミット1論点を意識する。

## マージ運用

- `main` へは **Squash and merge**(1PR = 1コミット)
- 条件:**CI 緑 + レビュー承認1件**
- マージ後のブランチは自動削除(Settings → General → Automatically delete head branches)

## 型契約の同期(重要)

WS/REST のメッセージ型を変えたら、**web(`apps/web/src/types/messages.ts`)と server(`apps/server/app/models.py`)を同じ PR で更新**する(docs/02 §4)。

## 困ったら

- 30分ハマったら早めにチームチャットで相談する
- 設計の一次資料は [docs/](./docs/00_overview.md)(00〜05 と dev-docs / design)
