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

> 本ドキュメント群は「設計と手順」をまとめたもの。各ドキュメントには**そのままコピペして使える成果物(ツリー / YAML / テンプレート本文)**を掲載しているので、TODOに沿ってファイル化すればリポジトリ整備が完了する。

---

## 前提・現状

- リポジトリ:`imasoko`(ブランチ `main` のみ、初期コミット済み)
- 現状のファイル:`README.md` と `docs/` のみ。**アプリ実体(frontend / backend)は未作成**
- チーム:4人(ホスト=フルスタック、初心者A/B/C)。分担は [imasoko-dev-docs.md §11](./imasoko-dev-docs.md) を基準にする
- ホスティング:チームメンバーの個人サーバー + リバースプロキシ(TLS終端・WS中継)

## 実行順序(フェーズ)

依存関係があるため、原則この順で進める。

```
フェーズ0: リポジトリ整備      ← 本ドキュメント群でカバー(01→04)
  ├ 01 ディレクトリ骨格 & .gitignore
  ├ 04 GitHubテンプレート & ブランチ保護 & 命名規約(先に決めると全PRに効く)
  ├ 02 技術決定(TTL/throttle等の定数確定)
  └ 03 CI(空でも通る状態で先に用意 → 以降のPRで品質ゲートが効く)
        ↓
フェーズ1: 骨格実装           ← ホストが frontend/backend の起動可能な最小構成を用意
        ↓
フェーズ2: 機能実装(並行)     ← 分担に沿って各自ブランチ + PR
        ↓
フェーズ3: デプロイ           ← 03 のCD/手動デプロイ手順
```

推奨着手順:**01(骨格)→ 04(規約)→ 03(CIの器)→ 02(技術決定)**。
04と03を早く入れるほど、以降のすべてのPRが同じルール・同じ品質ゲートを通るようになり、初心者3人の手戻りが減る。

## マスターTODO(サマリ)

各項目の詳細チェックリストは各ドキュメント末尾にある。ここは全体の進捗把握用。

- [ ] **01 ディレクトリ設計**:`frontend/` `backend/` `.github/` の骨格と `.gitignore` を作成
- [ ] **04 GitHubテンプレート**:PR/Issueテンプレート・CODEOWNERS・CONTRIBUTING・ラベル・ブランチ保護
- [ ] **03 CI整備**:`frontend-ci` / `backend-ci` ワークフロー、Lint/Format/Test/Build ゲート
- [ ] **02 技術設計の確定**:TTL・throttle間隔・floor UI・退出・圏外表示の意思決定と定数化、設定/型/テスト方針
- [ ] **03 CD整備(任意・後回し可)**:Dockerfile / リバースプロキシ / デプロイ手順
- [ ] フェーズ1着手のGate:上記が揃い、`main` ブランチ保護が有効化されていること

## 命名・進め方の要約(詳細は 04)

- ブランチ:`feat/<scope>-<short>` / `fix/...` / `docs/...` / `chore/...`(例:`feat/rooms-api`)
- コミット:Conventional Commits(`feat(rooms): ルーム作成APIを追加` のように日本語本文OK)
- PR:`main` へは **Squash merge**、**レビュー1件 + CIグリーン** を必須化
- Issue駆動:作業は原則Issue化 → ブランチ → PR(`Closes #12`)
