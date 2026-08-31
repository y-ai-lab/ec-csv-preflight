# EC CSV Preflight

EC商品CSVを取込前に確認する、依存ゼロの静的MVPです。

## できること

- Shopify商品CSVの代表列／汎用EC列の推定
- ヘッダー不足・重複、行ごとの列数ずれ
- 商品ID／Handle・商品名・価格の欠損
- 価格の数値エラー・負数
- SKU重複、バリエーション名／値の片側欠損
- 画像URLの形式、公開状態、表計算ソフト由来のエラー値
- HOLD / REVIEW / PASS 判定
- Markdown / JSONレポートのダウンロード

入力はブラウザ内で処理し、サーバー・外部API・データベースへ送信しません。ログイン、秘密情報、顧客データの保存もありません。

## ローカル起動

Node.jsがある場合は、リポジトリ直下で次を実行します。

```bash
npm run qa
npm run check
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開きます。依存パッケージのインストールは不要です。

## 重要な境界

これは取込成功の保証や、Shopify管理画面への自動登録を行うものではありません。取込先の最新テンプレート、権限、画像の公開状態、在庫連携、文字コードなどは利用者が最終確認してください。個人情報・顧客情報を含むCSVは、所属組織のルールに従ってください。

## 公開資産の調査結果

今回の探索では、データ品質検査の考え方として [databroom](https://github.com/onlozanoo/databroom)（MIT）、可視化候補として [vue-data-ui](https://github.com/graphieros/vue-data-ui)（MIT）、ダッシュボード候補として [datart](https://github.com/running-elephant/datart)（Apache-2.0）を確認しました。MVPは配布・運用を単純にするため、これらのコードを同梱せず、依存ゼロの小さな検査エンジンとして実装しています。

ShopifyのCSV列依存、UTF-8、よくあるインポートエラーは [公式ヘルプ](https://help.shopify.com/en/manual/products/import-export/common-import-issues) と [CSVのデータ依存](https://help.shopify.com/en/manual/products/import-export/using-csv) を参照して設計しています。

## 0円運用

- 静的HTML / CSS / JavaScriptのみ
- 外部API・有料SaaS・VPS・独自ドメイン不要
- GitHub Pages等へ置く場合も、公開操作は利用者の承認後に行う
- Pages用Workflowは `workflow_dispatch` の手動起動だけで、cronは設定していない

## 最初の収益仮説

無料セルフチェックを入口に、ココナラで「EC商品CSVの取込前エラーチェック＋修正箇所レポート」を1件2,980円で提供するサービス＋自動化モデルを検証します。最初の1円は、有料案件を1件受注して取る想定です。このMVP自体は決済や顧客情報を扱いません。

## ライセンス

このMVP自身はMIT Licenseです。参照した外部資産のライセンスは、それぞれの原典と最新版の利用条件を必ず確認してください。

