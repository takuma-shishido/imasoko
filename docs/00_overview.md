# 00 セットアップ全体計画(索引)

「いまそこ」のリポジトリ整備を、**ディレクトリ設計・技術設計・CI/CD整備・GitHubテンプレート設計**の4領域に分けて進めるための索引とロードマップ。
各領域の詳細・成果物・TODOは以下の番号付きドキュメントにまとめている。

| No. | ドキュメント | 内容 |
|---|---|---|
| — | [imasoko-kikakusho.md](./imasoko-kikakusho.md) | 企画書(プロダクトの目的・機能) |
| — | [imasoko-dev-docs.md](./imasoko-dev-docs.md) | 技術文書(アーキ・API・WS・座標変換の一次資料) |
| 01 | [01_directory-design.md](./01_directory-design.md) | ディレクトリ設計(リポジトリ全体構成・責務・担当) |
| 02 | [02_technical-design.md](./02_technical-design.md) | 技術設計(未決定事項の確定・設定/型/エラー/テスト/セキュリティ) |
| 03 | [03_cicd.md](./03_cicd.md) | CI/CD整備(GitHub Actions・Lint/Test・デプロイ) |
| 04 | [04_github-templates.md](./04_github-templates.md) | GitHubテンプレート設計(PR/Issue/CODEOWNERS/ブランチ・コミット規約) |
| 05 | [05_feature-design.md](./05_feature-design.md) | 機能・データ設計(マップ3エリア/建物ドリルダウン/公開範囲/集合場所/空き教室CSV) |
| 06 | [06_implementation-status.md](./06_implementation-status.md) | **実装ステータス(差分サマリ・最新情報・細かいTODO)** ← 「今どうなっているか」の一次情報 |
| — | [design/](./design/00_index.md) | 画面ごとの詳細設計(トップ/公開一覧/参加/地図/各パネル/状態) |

> 本ドキュメント群は「設計と手順」をまとめたもの。各ドキュメントには**そのままコピペして使える成果物(ツリー / YAML / テンプレート本文)**を掲載しているので、TODOに沿ってファイル化すればリポジトリ整備が完了する。

---

## 前提・現状

- リポジトリ:`imasoko`(ブランチ `main` のみ、初期コミット済み)
- 現状のファイル:`README.md` と `docs/` のみ。**アプリ実体(`apps/web` / `apps/server`)は未作成**
- チーム:4人(ホスト=フルスタック、初心者A/B/C)。分担は [imasoko-dev-docs.md §11](./imasoko-dev-docs.md) を基準にする
- ホスティング:チームメンバーの個人サーバー + リバースプロキシ(TLS終端・WS中継)

## 実行順序(フェーズ)

依存関係があるため、原則この順で進める。

```
フェーズ0: リポジトリ整備      ← 本ドキュメント群でカバー(01→04)
  ├ 01 ディレクトリ骨格(apps/web・apps/server)& .gitignore
  ├ 04 GitHubテンプレート & ブランチ保護 & 命名規約(先に決めると全PRに効く)
  ├ 02 技術決定(TTL/throttle等の定数確定)
  └ 03 CI(空でも通る状態で先に用意 → 以降のPRで品質ゲートが効く)
        ↓
フェーズ1: 骨格実装           ← ホストが apps/web・apps/server の起動可能な最小構成を用意
        ↓
フェーズ2: 機能実装(並行)     ← 分担に沿って各自ブランチ + PR
        ↓
フェーズ3: デプロイ           ← 03 のCD/手動デプロイ手順
```

推奨着手順:**01(骨格)→ 04(規約)→ 03(CIの器)→ 02(技術決定)**。
04と03を早く入れるほど、以降のすべてのPRが同じルール・同じ品質ゲートを通るようになり、初心者3人の手戻りが減る。

## マスターTODO(サマリ)

各項目の詳細チェックリストは各ドキュメント末尾にある。ここは全体の進捗把握用。**細かい実装TODOと現状は [06 実装ステータス](./06_implementation-status.md) を参照。**

- [x] **01 ディレクトリ設計**:`apps/web/` `apps/server/` `.github/` の骨格と `.gitignore` を作成(実装済み。3エリアは `public/map/*.svg` ではなくインライン模式SVGで実装)
- [x] **04 GitHubテンプレート**:PR/Issueテンプレート・CODEOWNERS・CONTRIBUTING を作成(ラベル・ブランチ保護は**リポジトリ設定側で未実施**)
- [x] **03 CI整備**:`web-ci` / `server-ci` ワークフロー、Lint/Format/Test/Build ゲート(ローカルで各コマンド緑。GitHub上での緑確認は未)
- [x] **02 技術設計の確定**:定数化(config/constants)、設定/型/エラー/テストを実装。残る要合意は **throttle 間隔** と **有効期限モデルの統一**(集合時間+3h ⇔ 作成+2h, [06 §2](./06_implementation-status.md))
- [x] **05 機能・データ設計**:マップ3エリア/建物ドリルダウン/public・private/集合場所3タイプ/空き教室 を実装(フロントは**シミュレーション自走**、サーバー雛形は用意、**両者の実配線は未接続**)
- [x] **03 CD整備(任意)**:`deploy/Dockerfile` / `docker-compose.yml`(**Caddyは不採用**、リバースプロキシは各自運用)
- [ ] フェーズ1着手のGate:`main` ブランチ保護の有効化(status checks `build`/`test` + レビュー1)は**未実施**

## 命名・進め方の要約(詳細は 04)

- ブランチ:`feat/<scope>-<short>` / `fix/...` / `docs/...` / `chore/...`(例:`feat/rooms-api`)
- コミット:Conventional Commits(`feat(rooms): ルーム作成APIを追加` のように日本語本文OK)
- PR:`main` へは **Squash merge**、**レビュー1件 + CIグリーン** を必須化
- Issue駆動:作業は原則Issue化 → ブランチ → PR(`Closes #12`)
