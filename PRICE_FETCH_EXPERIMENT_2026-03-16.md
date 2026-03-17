# 価格取得可否の実験メモ（2026-03-16）

目的: 実装完了ではなく、1〜2商品の具体例で「取得できるか / 価格を抜けるか / 商品同定できるか / 継続運用できそうか / 課題やリスクは何か」を確認する。

## 制約
- `web_search` は Brave API key 未設定で使用不可。
- そのため、既知URLの直接取得 (`requests`, `web_fetch`) と HTML 解析ベースで確認した。

## 実験対象1: AirPods Pro 第2世代 USB-C (`MTJV3J/A`)

### じゃんぱら買取
- URL: `https://buy.janpara.co.jp/buy/search?keyword=AirPods%20Pro%20MTJV3J/A`
- 取得可否: 取得できた
- 商品同定: かなりしやすい
- 抜けた情報:
  - タイトル: `AirPods Pro 第2世代（2023/USB-C） MTJV3J/A`
  - 未使用品: `22,000円`
  - 中古品: `～15,000円`
- 所感:
  - サーバーサイドHTMLに価格が直接入っていて扱いやすい。
  - 型番指定でノイズが少ない。

### Yahoo!オークション 落札相場
- URL: `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=AirPods+Pro+MTJV3J%2FA&va=AirPods+Pro+MTJV3J%2FA&b=1&n=20`
- 取得可否: 取得できた
- 商品同定: 型番付きなら十分可能
- 抜けた情報:
  - 180日間落札相場: 最安 `253円` / 平均 `16,506円` / 最高 `62,702円` / `1,173件`
  - 個別例:
    - `【大黒屋】中古 AirPods Pro エアーポッズプロ 第2世代 MTJV3J/A...` → `15,000円`
    - `Apple AirPods Pro 第2世代(USB-C) MTJV3J/A 充電ケースのみ` → `4,000円`
    - `1円～Apple AirPods Pro 2nd ... MTJV3J/A` → `15,950円`
- 所感:
  - 全体相場と個別落札価格の両方がHTMLから抜ける。
  - ただし「ケースのみ」「片耳のみ」が混ざるため、タイトル正規化と除外語が必須。
  - 平均値は混在ノイズに引っ張られる可能性あり。

### ラクマ
- URL例: `https://fril.jp/s?query=AirPods%20Pro%20MTJV3J%2FA&order=asc&sort=sell_price`
- 取得可否: 取得できる
- 商品同定: 難しめ
- 抜けた情報:
  - タイトル・価格・商品URLは抜ける
  - ただし上位結果は `空箱`, `イヤーチップ`, `ケース` など付属品が大量混入
- 所感:
  - HTML構造は比較的取りやすい
  - しかし検索品質が弱く、型番でも周辺品が多い
  - 実運用には除外語辞書（空箱/ケース/左耳/右耳/イヤーチップ等）が必要

### メルカリ（軽い可否確認）
- URL例: `https://jp.mercari.com/search?keyword=AirPods%20Pro%20MTJV3J/A`
- 取得可否: HTML取得自体はできた
- 商品同定/価格抽出: 今回は未確認〜難しめ
- 所感:
  - 初見では本文抽出に価格が出ず、クライアントサイド描画寄りに見える
  - 続行するなら埋め込みJSONや内部APIの有無確認が必要
  - MVP初手の優先度は低め

## 実験対象2: Nintendo Switch 有機EL (`HEG-S-KABAA`)

### じゃんぱら買取
- URL: `https://buy.janpara.co.jp/buy/search?keyword=Nintendo%20Switch%20HEG-S-KABAA`
- 取得可否: 取得できた
- 商品同定: かなりしやすい
- 抜けた情報:
  - タイトル: `Switch 本体 (有機ELモデル) HEG-S-KABAA ネオンブルー・ネオンレッド 【2021年10月】`
  - 未使用品: `33,000円`
  - 中古品: `～21,000円`
- 所感:
  - 型番一致でかなりクリーン。
  - 買取サイトの基準値としてMVPに使いやすい。

### Yahoo!オークション 落札相場
- URLは型番違いで AirPods と同様の closedsearch パターンが利用可能。
- 今回はSwitchより AirPods / iPhone 13 を優先して確認。
- 補足で `iPhone 13 128GB` では、平均 `40,206円` / 件数 `8,234件` など相場集計と個別落札価格が抜けた。

### ラクマ
- URL例: `https://fril.jp/s?query=Nintendo%20Switch%20HEG-S-KABAA&order=asc&sort=sell_price`
- 取得可否: 取得できた
- 商品同定: AirPodsよりは良い
- 抜けた情報:
  - 例: `Nintendo Switch 本体 有機ELモデル HEG-S-KABAA` が `13,000円`, `15,000円`, `16,000円`, `17,500円` などで取得できた
  - URLも取得可能
- 所感:
  - ジャンク品も混ざるが、AirPodsより本体比率が高く扱いやすい
  - `ジャンク`, `本体のみ`, `付属品欠品` などの状態判定を別軸で持つと使える

## 現時点の判断
- **最優先で実装価値が高い**
  1. じゃんぱら等の公開買取価格（HTMLが安定、型番一致しやすい）
  2. Yahoo!オークション closedsearch の落札相場（集計値＋個票が取れる）
- **補助データとして有望**
  3. ラクマ（取れるがノイズ除去が必要）
- **後回し寄り**
  4. メルカリ（取得難度/安定性/将来の保守負荷が読みにくい）

## 次にやるとよいこと
1. タイトル正規化・除外語辞書を作る
   - 例: `空箱`, `ケース`, `イヤーチップ`, `左耳`, `右耳`, `充電ケースのみ`, `ジャンク`, `本体のみ`
2. `source adapters` を分ける
   - `janparaBuybackAdapter`
   - `yahooClosedSearchAdapter`
   - `rakumaSearchAdapter`
3. MVPでは平均値だけでなく、個票からノイズ除外後の中央値を使う
4. 型番があるカテゴリ（Apple製品, Switch, PS5など）から始める
