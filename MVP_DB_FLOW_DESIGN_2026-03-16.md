# MVP用DB設計と取得フロー案（2026-03-16）

前提:
- **メルカリは一旦除外**
- 主軸は **じゃんぱら買取 + Yahoo!オークション落札相場**
- **ラクマは補助ソース**
- MVPでは「商品候補をかなり正しく当てる」「ノイズをそこそこ除く」「売却判断に使える価格帯を1画面で見せる」を優先

---

## 1. 最小DBスキーマ案

DBは SQLite / D1 / Postgres どれでも成立するように、まずは素直なRDB前提で切る。

### 1-1. products（商品マスタ）

1商品=UIで選ばれる最小単位。型番強い商品を基本にする。

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  brand TEXT,
  series TEXT NOT NULL,
  display_name TEXT NOT NULL,
  canonical_model TEXT,          -- 例: MTJV3J/A, HEG-S-KABAA, CFI-2000A
  maker_model TEXT,              -- 例: A2638 など必要なら
  storage TEXT,                  -- 128GB, 256GB
  connectivity TEXT,             -- Wi-Fi, Cellular, SIMフリー, USB-C など
  color TEXT,
  release_year INTEGER,
  search_keywords_json TEXT NOT NULL,
  exclude_keywords_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

補足:
- `search_keywords_json` には別名・略称・検索補助語を持たせる
- `exclude_keywords_json` には「その商品ではノイズになりやすい語」を持たせる
  - 例: AirPodsなら `ケースのみ`, `左耳`, `右耳`, `空箱`

### 1-2. source_items（取得生データ）

ソース別の取得結果をまずそのまま保存する。ここが監査ログ兼デバッグ基盤。

```sql
CREATE TABLE source_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,     -- janpara_buyback / yahoo_closed / rakuma
  source_item_id TEXT,           -- サイト固有ID、なければURLハッシュ
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  title_raw TEXT NOT NULL,
  price_raw INTEGER,
  price_text_raw TEXT,
  condition_raw TEXT,
  status_raw TEXT,
  seller_raw TEXT,
  ended_at_raw TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  raw_payload_json TEXT NOT NULL,
  UNIQUE(source_type, source_item_id)
);
```

補足:
- Yahoo closedsearch の個票、ラクマの個票、じゃんぱらの買取結果を同じ箱に入れる
- HTML全文は不要。抽出済みフィールド + 復元に必要な最小 raw payload でよい

### 1-3. normalized_items（正規化済み）

生データを商品判定しやすい形に揃える層。

```sql
CREATE TABLE normalized_items (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  matched_product_id TEXT,
  match_score REAL NOT NULL DEFAULT 0,
  price_jpy INTEGER,
  item_type TEXT,                -- full_set / main_unit / accessory / empty_box / unknown
  condition_grade TEXT,          -- new / used_good / used_fair / junk / unknown
  is_noise INTEGER NOT NULL DEFAULT 0,
  noise_reason TEXT,
  feature_flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_item_id) REFERENCES source_items(id),
  FOREIGN KEY(matched_product_id) REFERENCES products(id)
);
```

`item_type` の例:
- `full_set`: 本体一式 / 通常売却対象
- `main_unit`: 本体のみだが売却相場としてまだ参考になる
- `accessory`: ケース, イヤーチップ, 充電器など
- `empty_box`: 空箱
- `unknown`: 不明

### 1-4. price_snapshots（UI表示用の統合結果）

商品ごとの最新相場サマリ。UIはまずこれを見る。

```sql
CREATE TABLE price_snapshots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  janpara_used_max INTEGER,
  janpara_unused_price INTEGER,
  yahoo_count INTEGER,
  yahoo_median INTEGER,
  yahoo_p25 INTEGER,
  yahoo_p75 INTEGER,
  yahoo_trimmed_mean INTEGER,
  rakuma_median INTEGER,
  rakuma_count INTEGER,
  suggested_quick_sale INTEGER,
  suggested_standard_sale INTEGER,
  suggested_aggressive_sale INTEGER,
  confidence_score REAL NOT NULL,
  notes_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY(product_id) REFERENCES products(id)
);
```

### 1-5. fetch_runs（取得ジョブ管理）

```sql
CREATE TABLE fetch_runs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  query_text TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,          -- running / success / partial / failed
  fetched_count INTEGER NOT NULL DEFAULT 0,
  normalized_count INTEGER NOT NULL DEFAULT 0,
  noise_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT
);
```

---

## 2. 取得→正規化→ノイズ除去→統合→UI表示フロー案

### 全体像

1. 商品マスタから対象商品を選ぶ
2. ソースごとに検索クエリを作る
3. 生データ取得 (`source_items`)
4. タイトル正規化・価格正規化 (`normalized_items`)
5. ノイズ除去
6. ソース別集計
7. 商品別統合スナップショット作成 (`price_snapshots`)
8. UIに表示

### 2-1. 取得

#### じゃんぱら買取
- 目的: **下限/即売り基準** を取る
- 基本クエリ: `series + canonical_model`
- 取る値:
  - 商品名
  - 未使用品価格
  - 中古上限価格
- 特徴:
  - 型番一致しやすい
  - ノイズが少ない
  - 売り切り・即金の基準として強い

#### Yahoo!オークション closedsearch
- 目的: **実売の中心価格帯** を取る
- 基本クエリ: `series + canonical_model + 必要なら storage/connectivity`
- 取る値:
  - 集計: 件数 / 最安 / 平均 / 最高
  - 個票: タイトル / 落札価格 / URL
- 特徴:
  - 個票があるので後段のノイズ除去が効く
  - MVPでは **平均値より中央値優先**

#### ラクマ
- 目的: 補助的な相場確認
- 取る値:
  - タイトル / 価格 / URL
- 特徴:
  - 周辺品ノイズが多い
  - UIでは「参考価格」として弱めに扱う

### 2-2. タイトル正規化

最低限の正規化:
- 全角/半角統一
- 英数小文字化
- 記号ゆれ吸収
  - `Wi-Fi`, `wifi`, `Wi‑Fi`
  - `USB-C`, `USBC`, `usb c`
  - `有機EL`, `OLED`
  - `cellular`, `セルラー`
- 容量表記統一
  - `128gb`, `128 GB`
- 型番表記統一
  - `/`, `-`, 空白を吸収して照合補助

出力例:
```json
{
  "normalizedTitle": "airpods pro 第2世代 usbc mtjv3j a",
  "tokens": ["airpods", "pro", "第2世代", "usbc", "mtjv3j", "a"]
}
```

### 2-3. 商品マッチング

MVPではルールベースで十分。

優先順位:
1. `canonical_model` 一致
2. シリーズ + 容量 + 接続方式 一致
3. 別名一致
4. カテゴリ補助語一致

`match_score` 例:
- 型番一致: +0.55
- シリーズ一致: +0.20
- 容量一致: +0.10
- 接続方式一致: +0.10
- 色一致: +0.05

閾値案:
- `>= 0.75`: 採用
- `0.55〜0.74`: 保留（MVPでは採用してもよいが confidence を下げる）
- `< 0.55`: 非採用

### 2-4. ノイズ除去

#### 共通除外語
- `空箱`
- `箱のみ`
- `ケースのみ`
- `充電ケースのみ`
- `左耳`
- `右耳`
- `片耳`
- `イヤーチップ`
- `カバー`
- `ジャンク`
- `部品取り`
- `説明必読`

#### 商品カテゴリ別の注意

**AirPods / イヤホン系**
- 強除外: `左耳`, `右耳`, `ケースのみ`, `イヤーチップ`, `空箱`
- 弱除外: `ジャンク`, `ノイズあり`

**iPhone / iPad**
- 強除外: `空箱`, `画面のみ`, `部品`, `ロックあり`
- 弱除外: `ジャンク`, `残債あり`

**Switch / PS5**
- 強除外: `ソフトのみ`, `箱のみ`, `コントローラーのみ`, `ドックのみ`
- 弱除外: `本体のみ`, `ジャンク`

MVPルール:
- 強除外語に当たれば `is_noise=1`
- `本体のみ` は除外せず `item_type=main_unit` に落とす
- `ジャンク` は除外より別集計でもよいが、MVPではまず除外寄りが安全

### 2-5. 統合ロジック

#### ソースごとの役割
- **じゃんぱら** = 買取下限・即売り基準
- **Yahoo!オークション** = 実売相場の主軸
- **ラクマ** = 補助的な確認値

#### MVPの価格計算

1. Yahoo個票のノイズ除去後価格群を作る
2. 以下を計算
   - median
   - p25
   - p75
   - trimmed mean（上下10%カット）
3. じゃんぱら価格と比較して UI向け提案価格を出す

提案例:
- `quick_sale` = `max(janpara_used_max, yahoo_p25)`
- `standard_sale` = `yahoo_median`
- `aggressive_sale` = `yahoo_p75`

補正:
- Yahoo件数が少ない (`< 5`) → confidence を下げる
- じゃんぱらしかない → `quick_sale` のみ強く表示
- ラクマがYahooと大きく乖離 → 注意メモ追加

### 2-6. UI表示

商品詳細画面でまず見せるもの:
- 商品名 / 型番 / 容量 / 接続方式
- **いますぐ売る目安**（じゃんぱら）
- **個人売買の相場**（Yahoo中央値）
- **強気で出す目安**（Yahoo p75）
- 参考件数
- ノイズ除去後のサンプル件数
- 補助ソース（ラクマ参考）
- 注意事項
  - `ケースのみ除外済み`
  - `ジャンク除外`
  - `件数少なめ`

表示の考え方:
- MVPでは「精密な自動査定」より「売り先判断」を優先
- 1価格に断定せず、**3本の価格帯**で見せる

---

## 3. MVPで先に扱うカテゴリ/型番強い商品の優先順位

優先基準:
- 型番が強い
- じゃんぱらで引きやすい
- Yahoo個票で十分件数がある
- 周辺品ノイズを辞書で抑えやすい

### 優先度A（最初にやる）

1. **iPhone 13 / 14 系（容量別）**
   - 理由: 件数が多い、型番/容量/SIMフリー等で切りやすい
   - 注意: バッテリー状態、キャリア残債、ジャンク混入

2. **AirPods Pro 第2世代（Lightning / USB-C）**
   - 理由: 型番が強い、じゃんぱらが使いやすい
   - 注意: `ケースのみ`, `片耳`, `空箱` が多い

3. **Nintendo Switch 有機EL（HEG-S-KAAAA / HEG-S-KABAA）**
   - 理由: 型番強い、じゃんぱらもYahooも扱いやすい
   - 注意: `本体のみ`, `ジャンク`, `ドックなし`

### 優先度B（次）

4. **iPad Air 第5世代（64/256, Wi-Fi/Cellular）**
   - 理由: 型番/容量/通信方式で分割しやすい
   - 注意: Wi-Fi/Cellular混同、アクセサリ混在

5. **PS5 Slim（CFI-2000A / CFI-2000B）**
   - 理由: 型番強い
   - 注意: コントローラー欠品、本体のみ、外箱有無

### 優先度C（後）

6. **Apple Watch SE 第2世代**
   - 理由: 取れるがサイズ/GPS/Cellular/バンドの差が面倒
   - 注意: 本体のみ・バンド違い・ペアリング解除状態

### MVP対象数の推奨

最初は **8〜12 SKU** で十分。

推奨スターターSKU:
- iPhone 13 128GB
- iPhone 13 256GB
- AirPods Pro 第2世代 Lightning
- AirPods Pro 第2世代 USB-C
- Switch 有機EL ホワイト
- Switch 有機EL ネオン
- iPad Air 5 64GB Wi-Fi
- iPad Air 5 256GB Cellular
- PS5 Slim CFI-2000A
- PS5 Slim CFI-2000B

---

## 4. 実装に移すならよいファイル構成

静的MVPから次段へ進むなら、**取得・整形・表示を分離**したほうがいい。

```txt
resell-assist-mvp/
  data/
    products.json                  # 商品マスタ
    noise-rules.json               # 共通/カテゴリ別除外語
  scripts/
    fetch-prices.js                # 全体ジョブ起動
    snapshot-prices.js             # 統合集計→price snapshot生成
  lib/
    core/
      normalize.js                 # 全角半角/記号/型番正規化
      match-product.js             # 商品マッチング
      classify-item.js             # full_set / accessory / junk 判定
      aggregate-prices.js          # median, p25, p75, trimmed mean
    sources/
      janpara-buyback.js
      yahoo-closed-search.js
      rakuma-search.js
    db/
      schema.sql
      repository.js                # 保存/取得
    ui/
      view-model.js                # price_snapshots -> 画面用整形
  cache/
    raw/                           # 任意。取得レスポンスキャッシュ
  docs/
    MVP_DB_FLOW_DESIGN_2026-03-16.md
```

### 役割分離

- `sources/*`
  - 各サイトの取得と抽出だけ担当
- `core/normalize.js`
  - タイトルや型番の表記ゆれ吸収
- `core/classify-item.js`
  - `ケースのみ`, `空箱`, `ジャンク` 判定
- `core/aggregate-prices.js`
  - ノイズ除去後の中央値など算出
- `ui/view-model.js`
  - UIで使う文言・価格帯へ変換

### 最短実装の順番

1. `products.json` を MVP対象SKUに絞る
2. `noise-rules.json` を作る
3. `sources/janpara-buyback.js` 実装
4. `sources/yahoo-closed-search.js` 実装
5. `normalize.js` + `classify-item.js` 実装
6. `aggregate-prices.js` 実装
7. まずは JSON 保存で回す
8. DB化はその後でもよい

---

## 5. JSONスキーマ草案（DB前の暫定保存にも使える）

### products.json 例

```json
{
  "id": "airpodspro2-usbc",
  "category": "earbuds",
  "brand": "Apple",
  "series": "AirPods Pro 第2世代",
  "displayName": "AirPods Pro 第2世代 USB-Cケース",
  "canonicalModel": "MTJV3J/A",
  "storage": null,
  "connectivity": "USB-C",
  "searchKeywords": [
    "airpods pro 第2世代",
    "airpods pro usb-c",
    "mtjv3j/a"
  ],
  "excludeKeywords": [
    "ケースのみ",
    "充電ケースのみ",
    "左耳",
    "右耳",
    "片耳",
    "空箱",
    "イヤーチップ"
  ]
}
```

### price snapshot 例

```json
{
  "productId": "airpodspro2-usbc",
  "snapshotAt": "2026-03-16T13:30:00+09:00",
  "janpara": {
    "unusedPrice": 22000,
    "usedMax": 15000
  },
  "yahoo": {
    "count": 31,
    "median": 15800,
    "p25": 14500,
    "p75": 17200,
    "trimmedMean": 16020
  },
  "rakuma": {
    "count": 12,
    "median": 16800
  },
  "suggested": {
    "quickSale": 15000,
    "standard": 15800,
    "aggressive": 17200
  },
  "confidence": 0.82,
  "notes": [
    "ケースのみ・片耳出品を除外",
    "Yahoo個票ベースで中央値算出"
  ]
}
```

---

## 6. 今の判断

- **MVPは じゃんぱら + Yahoo 個票処理 で十分価値が出る**
- ラクマは「参考」に留めるのがちょうどいい
- メルカリを外しても、売却支援の初期価値はかなり作れる
- 重要なのは取得先追加より先に、**商品マスタの粒度** と **ノイズ除去辞書** を固めること
- UIは「査定額」ではなく、**売り方別の価格レンジ提案** として出すのが安全で分かりやすい
