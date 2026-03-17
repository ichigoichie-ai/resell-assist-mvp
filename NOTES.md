# MVP改善メモ

## 今回追加したこと
- 検索正規化: 全角/半角, `AirPodsPro2` のような連結語, `有機EL`/`OLED`, `Wi‑Fi`/`wifi`, `Cellular`/`セルラー` を吸収
- ローカル種データ拡張: 4件→7件
  - iPhone 13 128GB
  - AirPods Pro 第2世代
  - Nintendo Switch 有機ELモデル
  - iPad Air 第5世代 64GB Wi‑Fi
  - iPad Air 第5世代 256GB Cellular
  - PlayStation 5 Slim CFI-2000
  - Apple Watch SE 第2世代 44mm
- 型番/仕様トークンを `searchTokens` に追加
- ブラウザ表示ロジックと検索/採点ロジックを分離
- Nodeで回せる簡易テストを追加

## 確認した検索例
- `iphone13 128` -> iPhone 13 128GB
- `airpodspro2` -> AirPods Pro 第2世代
- `switch heg` -> Nintendo Switch 有機ELモデル
- `ipad air 第5世代 cellular 256gb` -> iPad Air 第5世代 256GB Cellular
- `ps5 cfi-2000` -> PlayStation 5 Slim CFI-2000
- `applewatch se2 44mm` -> Apple Watch SE 第2世代 44mm

## 残った課題
- `ipad 64gb` のような曖昧クエリは当たりすぎる可能性あり
- 実データがないので価格レンジの確からしさは未検証
- 状態差（バッテリー容量, キズ, 付属品欠品）で価格調整するロジックは未着手
