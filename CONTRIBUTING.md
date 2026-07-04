# コントリビュートガイド(いまそこ)

チームで同じルール・同じ書式で開発するためのガイド。詳細な設計は [docs/](./docs/00_overview.md) を参照。

## 開発手法:Issue駆動開発

**このプロジェクトは Issue 駆動で進める。作業は必ず Issue から始める。**

### 開発の流れ

1. Issue を作る(または割り当てられた Issue を確認)
2. ブランチを切る:`<type>/<scope>-<short>`(命名規約は下記)
3. 実装 → ローカルで動作確認(front: `npm run dev` / back: `uvicorn app.main:app --reload`)
4. PR を出す(テンプレートに沿って記入、`Closes #<Issue番号>`)
5. CI が緑・レビュー承認1件でマージ(**Squash and merge**)

### 担当・難易度の決め方(トリアージ)

| 条件 | 担当 | ラベル |
|---|---|---|
| **干渉範囲が広い**(複数モジュールに波及)**または 2時間以上**かかりそう | **@takuma-shishido に割り当て** | 通常ラベルのみ |
| 難易度が低く・影響が閉じている | 無担当(誰でも着手可) | **`good first issue`** を付ける |

> 迷ったら「重い側」に寄せて `@takuma-shishido` 担当にする(初心者が詰まってブロックしないため)。

### 優先度ラベル

| ラベル | 意味 |
|---|---|
| `priority:p0` | 🔴 最優先:当日までに必須・ブロッカー |
| `priority:p1` | 🟠 高:主要機能・優先着手 |
| `priority:p2` | 🟡 中:余裕があれば・改善系 |

### Issue の書き方(絵文字ルール)

テンプレート([Issue Forms](./.github/ISSUE_TEMPLATE/task.yml))に沿って書く。書式は既存 Issue に合わせる。

- **タイトル**:`<内容の絵文字> [Task] <日本語タイトル>`(例:`🔌 [Task] WebSocket 実配線`)。種別は `[Task]` / `[Bug]` / `[Feature]`。
- **本文の見出しは絵文字付きで固定**:🎯 ゴール / 🧩 やること(`- [ ]` チェックリスト)/ 🏁 完了条件(✅ 受け入れ条件)/ 📚 参考(関連ドキュメント)。

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
