# KURA — 在庫管理デモ

入出庫の履歴から在庫を組み立てる、在庫管理システムのデモです。仕様・規約・タスクは [`CLAUDE.md`](./CLAUDE.md) にあります。

## 使い方

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 単体テスト（在庫エンジン・分析・シード・リポジトリ）
npm run bench      # 在庫一覧の算出ベンチマーク（NFR-04：150ms 以下）
npm run build
```

- `/` … ダッシュボード（Phase 0 時点の先行版）
- `/dev/components` … コンポーネントカタログ（本番では非公開にする予定）

## 構成の要点

| 層 | 場所 | 役割 |
|---|---|---|
| 在庫算出 | `lib/inventory/` | 純粋関数。トランザクションから4つの在庫数を算出。在庫数はどこにも保存しない |
| 分析 | `lib/analytics/` | 回転率・滞留・ABC・差異・欠品（純粋関数） |
| シード | `lib/seed/` | `now` を基準に 180日分の入出庫をシミュレーションして生成（決定的） |
| ストア | `lib/store/` | Zustand + persist。シードとの差分だけを localStorage に保存 |
| リポジトリ | `lib/repo/` | 画面が触る唯一の層。全メソッド async・Result 型。`_scope.ts` で見える行・列を判定 |

## 環境変数

| 名前 | 用途 |
|---|---|
| `NEXT_PUBLIC_ARTICLE_URL` | 「元記事へ戻る」のリンク先 |
| `NEXT_PUBLIC_DOC_URL` | 「資料ダウンロード」のリンク先 |
