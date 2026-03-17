# Resell Assist MVP

中古売却アシストの軽量MVPです。

## できること
- 商品名から候補を出す
- SKU辞書 + price snapshot を使って代表10SKUの相場データを表示
- 高く売る / 早く売る / 手間を減らす の目的別に販路提案
- 早売れ / 標準 / 強気 の価格提案
- 出品タイトル / 説明文の自動生成
- 出品前チェックリストと関連アフィリエイト枠の表示

## 起動
```bash
cd resell-assist-mvp
npm run start
```

ブラウザで `http://localhost:4173` を開いてください。

## JSONスナップショット生成
```bash
npm run snapshot
# 実サイト取得を試す場合
RESALE_USE_LIVE_FETCH=1 npm run snapshot
```

生成先:
- `output/price-snapshots.json`
- `output/price-history.json`（任意。過去snapshotを productId ごとに積むと価格推移アラート表示に使える）

現状:
- `data/products-snapshot.json` にMVP対象SKUを10件定義（iPhone / AirPods / iPad / Switch / PS5 / Apple Watch）
- `data/noise-rules.json` に共通/カテゴリ別ノイズルールを定義
- `data/source-fixtures.json` に じゃんぱら買取 / Yahoo落札相場 / ラクマ のfixtureを配置
- `scripts/generate-snapshot.js` で normalize → classify → aggregate を通してJSONを出力
- `app.js` は `output/price-snapshots.json` の suggested / confidence / notes を優先表示

## メモ
- いまは静的HTML/JSなので軽いです
- APK化は後で WebView / Capacitor / Flutter 化できます
- 実データ連携や画像認識は未実装です
- いまは Yahooオークション / ラクマ / 買取サービス を想定した手入力シードデータ表示です
- スナップショット生成系は fixture駆動のため、次は各 source adapter を実サイト取得へ差し替える段階です
�のため、次は各 source adapter を実サイト取得へ差し替える段階です
