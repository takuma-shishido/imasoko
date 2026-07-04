# 04 GitHubテンプレート設計

関連:[00_overview](./00_overview.md) / [01 ディレクトリ設計](./01_directory-design.md) / [03 CI/CD](./03_cicd.md)

目的:**初心者3人が同じルール・同じ書式でIssue/PRを出せる**ようにする。テンプレートで「書くべきこと」を固定し、レビューとマージの品質を揃える。以下は**そのまま該当パスに置けばGitHubが認識する**ファイル本文。

配置(`.github/` 配下、[01](./01_directory-design.md) 参照):

```
.github/
├─ pull_request_template.md
├─ ISSUE_TEMPLATE/
│  ├─ bug_report.yml
│  ├─ feature_request.yml
│  ├─ task.yml
│  └─ config.yml
├─ CODEOWNERS
└─ dependabot.yml            # 任意
CONTRIBUTING.md              # ルート
```

---

## 1. PRテンプレート:`.github/pull_request_template.md`

```markdown
## 概要
<!-- 何を・なぜ変更したか。1〜3行で -->

## 関連Issue
Closes #

## 変更内容
- [ ]

## 確認したこと
- [ ] ローカルで動作確認した(frontは `npm run dev`, backは `uvicorn --reload`)
- [ ] Lint / 型 / テストが通る(CI緑)
- [ ] WS/RESTのメッセージ型を変えた場合、web(`apps/web/src/types/messages.ts`)と server(`apps/server/app/models.py`)の**両方**を更新した([02 §4](../docs/02_technical-design.md))

## スクリーンショット / 動画(UI変更時)

## レビュー観点・不安な点
<!-- レビュアーに特に見てほしい所 -->
```

---

## 2. Issueテンプレート(Issue Forms 形式)

GitHubのIssue Formは `.yml`。フォームで必須項目を強制でき、初心者でも記入漏れが減る。

### `.github/ISSUE_TEMPLATE/task.yml`(通常の開発タスク・メイン)

```yaml
name: "🛠 タスク"
description: 実装・調査などの作業タスク
title: "[Task] "
labels: ["task"]
body:
  - type: textarea
    id: goal
    attributes:
      label: ゴール
      description: このタスクで達成したいこと
    validations:
      required: true
  - type: textarea
    id: todo
    attributes:
      label: やること(チェックリスト)
      value: |
        - [ ]
  - type: dropdown
    id: area
    attributes:
      label: 対象領域
      options: [web, server, docs, infra/CI]
    validations:
      required: true
  - type: textarea
    id: notes
    attributes:
      label: 補足 / 関連ドキュメント
```

### `.github/ISSUE_TEMPLATE/bug_report.yml`

```yaml
name: "🐛 バグ報告"
description: 不具合の報告
title: "[Bug] "
labels: ["bug"]
body:
  - type: textarea
    id: what
    attributes:
      label: 症状
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: 再現手順
      value: |
        1.
        2.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期待する挙動
  - type: input
    id: env
    attributes:
      label: 環境(端末 / ブラウザ / OS)
      placeholder: "iPhone 15 / Safari, Android / Chrome など"
```

### `.github/ISSUE_TEMPLATE/feature_request.yml`

```yaml
name: "💡 機能提案"
description: 新機能・改善の提案
title: "[Feature] "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: 解決したい課題
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: 提案する内容
    validations:
      required: true
```

### `.github/ISSUE_TEMPLATE/config.yml`

```yaml
blank_issues_enabled: false
contact_links:
  - name: 質問・相談(チームチャット)
    url: https://example.com/team-chat
    about: バグ・タスク以外の相談はこちら
```

---

## 3. CODEOWNERS:`.github/CODEOWNERS`

対応するパスにPRが出ると担当が自動でレビュアーに割り当てられる。**`@handle` は実際のGitHubユーザー名に置き換える**([dev-docs §11](./imasoko-dev-docs.md) の分担に対応)。

```gitignore
# デフォルト(明示が無い変更)はホストがレビュー
*                            @HOST_HANDLE

# web 全般
/apps/web/                    @HOST_HANDLE

# server:担当ごと
/apps/server/app/rooms.py     @DEV_A_HANDLE @HOST_HANDLE
/apps/server/app/expiry.py    @DEV_B_HANDLE @HOST_HANDLE
/apps/server/app/handlers.py  @DEV_C_HANDLE @HOST_HANDLE
/apps/server/app/ws.py        @HOST_HANDLE
/apps/server/app/main.py      @HOST_HANDLE
/apps/server/app/config.py    @HOST_HANDLE

# ドキュメント・CI
/docs/                       @HOST_HANDLE
/.github/                    @HOST_HANDLE
```

> 初心者PRは「本人 + ホスト」でレビューする体制。ホストが必ず入るのでブロックにならない。

---

## 4. ブランチ命名・コミット・マージ規約

### ブランチ命名

```
<type>/<scope>-<short-desc>
```

| type | 用途 | 例 |
|---|---|---|
| `feat` | 機能追加 | `feat/rooms-api` |
| `fix` | バグ修正 | `fix/ws-reconnect` |
| `docs` | ドキュメント | `docs/coords-note` |
| `chore` | 設定・雑務 | `chore/ci-setup` |

### コミットメッセージ:Conventional Commits

```
<type>(<scope>): <要約>

例:
feat(rooms): ルーム作成APIとroom_id発行を実装
fix(ws): 切断時にmember_leftをブロードキャストするよう修正
docs(dev): TTLの決定値を反映
```

- `type` は英語、要約は**日本語でOK**
- 1コミット1論点を意識(粒度が荒くても学習優先で可)

### マージ運用

- `main` へは **Squash and merge**(履歴を1PR=1コミットに圧縮)
- マージ条件:**CI緑 + レビュー承認1件**([03 ブランチ保護](./03_cicd.md))
- マージ後ブランチは自動削除(Settings → General → Automatically delete head branches)

---

## 5. ラベル設計

| ラベル | 用途 |
|---|---|
| `task` / `bug` / `enhancement` | Issue種別(テンプレで自動付与) |
| `web` / `server` / `infra` / `docs` | 対象領域 |
| `good first issue` | 初心者が着手しやすいもの |
| `priority:high` | 当日までに必須 |
| `blocked` | 他タスク待ち |

> ラベルは Issues → Labels から手動作成でよい。数が増えたら `.github/labels.yml` + label-syncアクションで管理(任意)。

---

## 6. CONTRIBUTING.md(ルート・骨子)

初心者3人が最初に読む1枚。上記規約を1ファイルに集約する。

```markdown
# コントリビュートガイド(いまそこ)

## 開発の流れ
1. Issueを作る(または割り当てられたIssueを確認)
2. ブランチを切る: `feat/<scope>-<short>`(→ 命名規約)
3. 実装 → ローカルで動作確認(front: `npm run dev` / back: `uvicorn app.main:app --reload`)
4. PRを出す(テンプレートに沿って記入、`Closes #<Issue番号>`)
5. CIが緑・レビュー承認1件でマージ(Squash)

## セットアップ
- web: `cd apps/web && npm install && npm run dev`
- server: `cd apps/server && pip install -r requirements.txt -r requirements-dev.txt && uvicorn app.main:app --reload`
- 実機テスト: cloudflared/ngrok でHTTPS公開(位置情報はHTTPS必須。→ dev-docs §9)

## 困ったら
- 詰まったら早めにチームチャットへ。30分ハマったら相談する
- 設計の一次資料は docs/ を参照(01〜04 と dev-docs)
```

---

## 7. dependabot(任意):`.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /apps/web
    schedule: { interval: weekly }
  - package-ecosystem: pip
    directory: /apps/server
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

> ハッカソン期間中はPRが増えて煩雑なので**任意**。落ち着いてから入れる。

## TODO

- [ ] `.github/pull_request_template.md` を作成(担当:ホスト)
- [ ] `.github/ISSUE_TEMPLATE/` に `task.yml` / `bug_report.yml` / `feature_request.yml` / `config.yml` を作成(担当:ホスト)
- [ ] `.github/CODEOWNERS` を作成し、`@HANDLE` を実ユーザー名に置換(担当:ホスト。要:全員のGitHubアカウント収集)
- [ ] ルートに `CONTRIBUTING.md` を作成(担当:ホスト)
- [ ] リポジトリ設定:Squash mergeのみ許可 / head branch自動削除を有効化(担当:ホスト)
- [ ] ラベルを作成(`task`/`bug`/`enhancement`/`web`/`server`/`infra`/`docs`/`good first issue`/`priority:high`/`blocked`)(担当:ホスト)
- [ ] `config.yml` / `CONTRIBUTING.md` 内のチームチャットURLを実URLに差し替え(担当:ホスト)
- [ ] `.github/dependabot.yml` を作成(任意・後回し)(担当:ホスト)
- [ ] キックオフで全員にこのルール(ブランチ命名・PRフロー)を共有(担当:ホスト)
