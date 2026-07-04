# いまそこ

**集合、リンク一本で。** — URLを共有するだけで、参加者全員の現在地をリアルタイムにキャンパスマップ上へ表示する集合支援 Web アプリ(ログイン不要・インストール不要)。MUDS hackathon 2026。

Claude Design のプロトタイプ `いまそこ Prototype.dc.html` を、`docs/` のディレクトリ設計に沿って実装したもの。

## 構成

```
apps/
├─ web/     React + TypeScript (Vite)  … プロトタイプの忠実移植(フロント)
└─ server/  Python + FastAPI            … REST/WS/ルーム管理の雛形(docs/01・02・05 準拠)
docs/       企画書・技術文書・画面設計
```

- 詳細な設計は [docs/00_overview.md](./docs/00_overview.md) を起点に参照。
- ディレクトリ設計:[docs/01](./docs/01_directory-design.md) / 技術設計:[docs/02](./docs/02_technical-design.md) / 機能設計:[docs/05](./docs/05_feature-design.md) / 画面設計:[docs/design/](./docs/design/00_index.md)

## 起動手順

### web(フロント)

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173
```

`npm run build`(tsc + vite)/ `npm test`(座標変換のユニットテスト, Vitest)/ `npm run lint`。

- フロントは**プロトタイプのシミュレーションで自走**する(歩くメンバー・DEMOパネル・擬似WS状態)。
  バックエンドが無くても全画面を確認できる。右下の **DEMO** チップから各状態(期限切れ/満員/再接続 等)を切替可能。

### server(バックエンド雛形)

```bash
cd apps/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload   # http://localhost:8000
pytest                          # rooms / expiry / ws の最小テスト
```

REST:`POST /api/rooms` / `GET /api/rooms/{id}` / `GET /api/rooms/public` / `PATCH /api/rooms/{id}/visibility` / `GET /api/campus`。
WS:`/ws/{room_id}`(join → room_state → position/floor/meeting_point/…)。

開発時は Vite の `server.proxy` が `/api`・`/ws` を `:8000` へ転送する(dev-docs §9)。

## 実装メモ:プロトタイプ ↔ docs の差分

「プロトタイプ忠実」を優先しているため、フロントは以下で docs と異なる(要チーム確認):

1. **有効期限モデル** — docs は「作成から2時間」。フロントは**集合時間を指定 → その3時間後に自動終了**
   (`END_OFFSET = 3h`, `apps/web/src/lib/constants.ts`)。バックエンド雛形は docs 準拠(`room_ttl_seconds`)。
2. **作成フロー** — docs は [ルームを作る]即作成(private固定)。フロントは**作成モーダル**でルーム名・公開範囲・集合時間を先に指定。
3. **地図/座標** — docs は実地理トレースSVG + lat/lng キャリブレーション変換。フロントのデモは**模式SVG + 直接 x/y**。
   docs の変換(`apps/web/src/lib/coords.ts`:`project`/`resolveArea`/クランプ + テスト)は実位置取得経路用に実装済み。
4. **データ配線** — フロントのデモはメンバー/建物をインライン定数で表示。本番の `GET /api/campus`(建物/教室)はサーバー雛形に用意。
   フロントとサーバーの**実配線(WSでの実位置同期)は未接続**(`apps/web/src/hooks/useRoomSocket.ts` / `lib/api.ts` に土台あり)。

## スコープ外(未着手)

CI/CD([docs/03](./docs/03_cicd.md))・GitHub テンプレート([docs/04](./docs/04_github-templates.md))・デプロイ資材・実測キャリブレーション値。
