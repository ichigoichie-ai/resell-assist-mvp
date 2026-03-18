# 買取比較.net

商品名を入れると、**標準相場 / すぐ売る価格 / おすすめ販路** をすぐ確認できる軽量Webアプリです。

公開版:
- https://kaitorihikaku.net

## できること
- 商品名・型番から候補を検索
- Yahooオークション / ラクマ / じゃんぱらをもとに相場表示
- **標準相場** / **すぐ売る価格** / **強気価格** を表示
- おすすめ販路を提案
- 出品タイトル / 説明文のたたき台を生成
- live / fallback の状況と信頼度の目安を表示

## PDM判断メモ
- 方向性メモ: `PDM_STRATEGY_2026-03-18.md`
- MVPは「中古売却の意思決定を助ける比較サイト」として進める
- 収益化の初手は、買取送客 + 周辺アフィリエイト想定

## 対応カテゴリ
- iPhone
- AirPods
- iPad
- Nintendo Switch
- PS5
- Apple Watch

現状は特に **iPhone中心** に精度を強化しています。

## ローカル起動
```bash
cd resell-assist-mvp
npm run start
```

ブラウザで `http://localhost:4173` を開いてください。

## スナップショット更新
```bash
npm run snapshot

# 実サイト取得を試す場合
RESALE_USE_LIVE_FETCH=1 npm run snapshot
```

生成先:
- `output/price-snapshots.json`
- `output/price-history.json`（任意）

## デプロイ
このプロジェクトは Cloudflare Workers + static assets で公開しています。

```bash
npx wrangler deploy worker.js --name resell-assist-mvp --assets . --compatibility-date 2026-03-17
```

## 補足
- 価格は参考値です。状態・付属品・バッテリー状況などで上下します。
- 一部データは fallback を含みます。
- 公開版として改善を継続中です。
