# CLAUDE.md

AI(Claude Code 等)向けの運用ガイド。人間向けの詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) と [docs/](./docs/00_overview.md) を参照。
設計の一次情報は [docs/06 実装ステータス](./docs/06_implementation-status.md)(「今どうなっているか」)と [docs/07 API設計](./docs/07_api-design.md)。

## プロジェクト概要

「いまそこ」= 集合時のリアルタイム位置共有アプリ。`apps/web`(React + TypeScript / Vite)+ `apps/server`(FastAPI, インメモリ)。

## 開発手法:Issue駆動開発

**すべての作業は Issue から始める。** コードに手を入れる前に、対応する Issue を用意する(既存の割り当てを確認する / 無ければ作る)。

### 担当・難易度のトリアージ(重要)

Issue を作る/整理するときは、次の基準で担当とラベルを決める:

| 条件 | 担当 | ラベル |
|---|---|---|
| **干渉範囲が広い**(複数モジュールに波及)**または 2時間以上**かかると推測される | **@takuma-shishido に割り当て** | 通常ラベルのみ |
| 難易度が低く・影響範囲が閉じている | 無担当(誰でも着手可) | **`good first issue`** を付与 |

- 迷ったら「2時間以上 or 干渉範囲が広い」に寄せて `@takuma-shishido` 担当にする(初心者をブロックしないため)。
- 例(実績):`good first issue` = データ入力・pytest追加・ヘルスチェック・ロギング。`@takuma-shishido` = WS実配線・実位置取得・地図SVG実測・有効期限モデル統一。

### 優先度ラベル

| ラベル | 意味 |
|---|---|
| `priority:p0` | 🔴 最優先:当日までに必須・ブロッカー(これが無いと成立しない) |
| `priority:p1` | 🟠 高:主要機能・優先着手 |
| `priority:p2` | 🟡 中:余裕があれば・改善系 |

> 旧 `priority:high` は `priority:p0` に統合(新規付与は p0/p1/p2 を使う)。

## Issue の書式(絵文字ルール)

既存 Issue に合わせる。テンプレートは [`.github/ISSUE_TEMPLATE/task.yml`](./.github/ISSUE_TEMPLATE/task.yml)。

**タイトル**:`<内容を表す絵文字> [<種別>] <日本語タイトル>`
- 種別プレフィックス:`[Task]` / `[Bug]` / `[Feature]`
- 先頭に内容を表す絵文字を1つ付ける(例:🔌 WS / 📍 位置 / 🗺️ 地図 / 🏢 建物 / 🏫 教室 / 🧪 テスト / 📝 ログ / ⏳ 期限)

**本文の見出しは絵文字付きで固定**:
- 🎯 ゴール — このタスクで達成したいこと
- 🧩 やること — `- [ ]` のチェックリスト
- 🏁 完了条件 — ✅ で満たすべき受け入れ条件
- 📚 参考 — 関連ドキュメント・ファイルへのリンク

**ラベルの説明も絵文字付き**で統一(例:`task` = 🛠 作業タスク、`web` = 💻 フロント、`server` = 🖥 バックエンド、`good first issue` = 🌱 初心者向け)。既存ラベルは `gh label list` で確認。

## 実装時の必須ルール

- **型契約の同期**:WS/REST のメッセージ型を変えたら、web(`apps/web/src/types/messages.ts`)と server(`apps/server/app/models.py`)を**同じ PR で更新**する(docs/02 §4・docs/07)。
- **ブランチ / コミット**:`<type>/<scope>-<short>`(feat/fix/docs/chore)+ Conventional Commits(`<type>(<scope>): 要約`、要約は日本語可)。詳細は CONTRIBUTING.md。
- **マージ**:`main` へは Squash and merge、CI 緑 + レビュー承認1件。PR 本文に `Closes #<Issue番号>`。
- **有効期限モデル**:集合時間(`meet_at`)+ 3時間で統一(front `END_OFFSET` / server `end_offset_seconds`、issue #4)。

## ローカル検証(= CI と同一コマンド)

- **web**:`cd apps/web` → `npm run lint` / `npm run typecheck` / `npm run format:check` / `npm test` / `npm run build`
- **server**:Python **3.12** 必須。`cd apps/server` → `uv venv --python 3.12 .venv`(既存 `.venv` があれば `. .venv/bin/activate`)→ `ruff check .` / `ruff format --check .` / `pytest -q`
  - ※ システム既定の `python3` は 3.9 で動かない。必ず 3.12 の venv を使う。
