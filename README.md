# Shopify CSV Preflight v0.2

Shopifyの商品CSVを登録前にチェックし、**安全に確定できる修正だけ自動適用して修正版CSVを書き出す**、依存ゼロの静的MVPです。

## できること

- Shopify商品CSVの代表列を推定
- ヘッダー不足・重複、行ごとの列数ずれ
- Handle・Title・価格の欠損
- 価格の数値エラー・負数
- SKU重複
- Option1 Name / Option1 Valueの片側欠損
- 画像URL形式
- Status値
- 表計算ソフト由来のエラー値
- HOLD / REVIEW / PASS 判定
- Markdown / JSONレポート
- **修正版CSVの書き出し**

入力はブラウザ内だけで処理し、サーバー・外部API・データベースへ送信しません。

## 安全な自動修正

v0.2では、意味を変えない範囲だけ自動修正します。

例：

- ` ¥1,980 ` → `1980`
- Handle / Title / SKU / Option / Image URLの前後空白を除去
- ShopifyのStatus表記
  - `公開` → `active`
  - `非公開` / `下書き` → `draft`
  - `アーカイブ` → `archived`
- UTF-8 CSVとして再シリアライズ

以下は**推測で直しません**。

- SKU重複
- Handle欠損
- Title欠損
- 価格欠損
- 壊れた画像URL
- バリエーション構造の欠損
- 列数が壊れているCSV

列数不一致やCSV構造エラーがある場合は、自動修正そのものを停止します。

## Shopify仕様との境界

2026-08-31時点のShopify公式ヘルプでは、商品CSVについてUTF-8、正しいヘッダー、価格、画像URL、オプション構造などの整合性が重要とされています。Status列がある場合の有効値は `active` / `draft` / `archived` です。

- https://help.shopify.com/en/manual/products/import-export/using-csv
- https://help.shopify.com/en/manual/products/import-export/common-import-issues

このMVPはShopifyへの取込成功を保証しません。最新テンプレート、在庫、画像公開状態、既存商品との競合、ストア固有設定は最終確認が必要です。

## 起動

Node.jsがある場合：

```bash
npm run verify
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。

## QA

```bash
npm run verify
```

確認項目：

- CSV解析
- Shopify基本チェック
- 安全な価格・空白・Status修正
- 修正後CSVの再チェック
- SKU重複や欠損を勝手に補完しない
- 列数不一致では自動修正停止

GitHub Actionsでもpush時にQAを実行します。

## 0円運用

- 静的HTML / CSS / JavaScript
- 有料APIなし
- VPSなし
- DBなし
- ログインなし
- GitHub Pages
- Public Repository向けGitHub Actions

追加運用費は0円です。

## 事業での使い方

このMVP自体を売るより、**「Shopify商品CSVの登録前チェック＋修正版CSV＋要確認レポート」**の納品エンジンとして使います。

初期の販売仮説：

- 商品：Shopify商品CSV 登録前チェック＋修正版CSV納品
- 初期価格：5,000円
- 販売チャネル：ココナラ
- 納品物：修正版CSV / エラー一覧 / 要確認箇所

## ライセンス

このMVP自身はMIT Licenseです。
