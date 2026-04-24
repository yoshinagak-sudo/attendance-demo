# UI v2: 管理画面シンプル化 + 打刻画面リビルド

## 方針

### 管理画面（/admin）
- 色はモノクロ + primary 1色 + semantic 2色（warn/danger）のみ
  - leaf / earth / info / primary-soft などのブランドアクセントは廃止
- グラデーション全廃
- シャドウは 0〜ごく薄（border で区切る業務UI）
- アイコン（SVG・記号）は KPI カードから削除、ai-summary の葉アイコンも削除
- 情報密度（補足 foot / 凡例）は維持

### 打刻画面（/）
3段構成:

1. **大時計** (画面最上部)
   - HH:MM:SS 80px tabular-nums
   - 日付 + 曜日 16px muted
   - クライアントで毎秒更新（SSRは初期値）

2. **名前ボタングリッド** (中央)
   - 3列 × 段。ボタン最小 140 × 96px
   - 状態3種:
     - 未打刻: 白背景 + border / 「未打刻」
     - 出勤中: primary 枠 + 左上ドット + 「HH:MM 出勤中」
     - 退勤済: 薄グレー + 「HH:MM 退勤済」
   - 1タップで IN/OUT 自動トグル
   - タップ時: ボタン内にチェックが一瞬出る + 上部に toast
   - active 時は opacity 0.5 で連打ガード

3. **直近3件履歴** (下部)
   - サーバーから最新3件を渡す
   - 横3カード: 「N 分前 / 〇〇さん / 出勤|退勤」
   - 打刻直後に revalidate で反映

## 余白 / タイポ（据置）
- spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
- font-size: 11 / 12 / 13 / 14 / 16 / 20 / 22 / 28 / (80: clock only)
- font-weight: 500 / 600 / 700

## 色パレット（削減後）

| 役割 | 値 | 用途 |
|---|---|---|
| --bg | #f5f6f2 | 背景（微グリーン・現行維持） |
| --surface | #ffffff | カード |
| --surface-alt | #f8f9f5 | テーブル thead / トラック背景 |
| --surface-hover | #f1f3ec | hover |
| --border | #e0e3d9 | 標準罫線 |
| --border-strong | #c3c9b8 | 強調罫線 |
| --divider | #eaede3 | 弱罫線 |
| --text | #1b2017 | 本文 |
| --text-sub | #4a5340 | 副テキスト |
| --muted | #7a8471 | ラベル |
| --muted-2 | #a7ad9d | 補足 |
| --primary | #0f766e | 唯一のアクセント |
| --primary-soft | #e6f2f0 | 出勤中ボタン/バッジ背景 |
| --warn | #b45309 | 要確認（KPI foot） |
| --warn-bg | #fef3c7 | |
| --danger | #b91c1c | 長時間勤務のみ |
| --danger-bg | #fef2f2 | |

削除: --leaf, --earth, --info, --info-bg, --dark, --dark-hover, --primary-bg(primary-softに統合), --primary-hover(single primaryで十分), --warn-soft, --danger-soft

（実装時に primary-hover は残す。その他の削減は確実に実施）
