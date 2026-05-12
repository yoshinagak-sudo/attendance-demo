# スマホ全画面ブラッシュアップ設計メモ

対象: iPhone 14 Pro 390px 幅 主、iPhone SE 375px 副。タブレット 768px+ は既存維持。

## 共通方針
- ブレイクポイント: 既存の `640px / 900px` を基本に、必要に応じて `480px` を追加
- 余白: `container-wide` のスマホ padding を `20px 16px 48px` のまま維持
- タップ領域: 全インタラクティブ要素 44px 以上
- font-size: スマホは 13/14/16/18/20 を主軸。`card-value` は 22-24px に抑える

## A. AppHeader / UserMenu
- スマホ 640px 以下:
  - `header-app-brand-name`「勤怠アプリ」を非表示 (既に 480px で hidden) → 640px で hidden に変更
  - `user-menu-role` バッジを小さく: padding 1px 6px, font-size 9px
  - `user-menu > summary` の max-width を 160px に縮小、name max-width を 8em に
  - 名前が省略表示でも分かる title 属性は既に効くため OK
  - 540px 以下: caret 「▾」を維持しつつ余白を tight に

## B. ページ見出し `.header`
- 640px 以下:
  - flex-direction: column-reverse でナビ群を上に置く → と思ったが「タイトル」が主役なので column のまま gap を 12px に
  - リンク群を `.ot-admin-actions` で wrap、右寄せ → 横並びでも 2-3 行で良いが、もっと spaced にする
  - 上端の Link は「← 戻る」と「現在ページのアクション」を pill 化、横スクロール対応 (overflow-x: auto) で改行を防ぐ
  - h1 タイトル `.container-wide .title`: 18px に変更（既存 20px）、line-height 1.3
  - subtitle: 11px

## C. KPIカード `.cards .card`
- スマホ 640px 以下:
  - `card-value` font-size 22px (28→22)
  - 長い文字値 (`13時間30分`) の場合 letter-spacing 縮小 + nowrap保証
  - `card-value` の display: flex で wrap 可、`card-unit` の自動配置
  - padding 12px 14px (微tight)
  - `card-foot` font-size 10px に縮小

## D. 未承認バナー `.ot-banner-warn` (admin)
- カスタムスタイル `ot-pending-banner` を新設 (スマホで縦並び化)
- スマホ:
  - flex-direction: column
  - 矢印を下に大きく表示
  - タップ領域全幅 (min-height 64px)
  - タイトル + 値で 2 行構成: 「未承認 残業 3件」「合計 5時間15分 →」

実装は admin/page.tsx の inline style を全て CSS class 化する

## E. ガントチャート
- スマホ 640px 以下:
  - `.gantt-toolbar` を縦並びに (flex-direction: column, align-items: flex-start)
  - `.gantt-legend` の gap を 12px に
  - `.gantt-label` 幅を 80px に縮小
  - `.gantt` の min-width: 600px (720→600)
  - `.gantt-axis` の margin-left を 80px に
  - `.gantt-row` height 28px (34→28)、`.gantt-track` height 22px (26→22)
  - `.gantt-bar` height 16px、`gantt-bar-text` の padding 0 4px
  - スクロール可能サイン: `.gantt-scroll` の右端に linear-gradient (pseudo) でフェードを出す

## F. テーブル
- スマホ 640px 以下、共通:
  - `.badge`, `.ot-badge-pre`, `.ot-badge-post`, `.badge-in`, `.badge-out` に `white-space: nowrap` を明示
  - 「出勤」「退勤」「事前」「事後」が縦割れにならない
- `/admin` 打刻履歴テーブル: 既に table-wrap でスクロール対応、padding tight に
- `/admin/users`: 横スクロール時に「→」インジケータ追加 (or 細い列に絞る = 列数削減はせず、horizontal scroll明示)

## G. 承認キュー `/admin/overtime`
- **スマホ 640px 以下**: テーブルを完全に **カードリスト化**
  - 既存 9列 thead/tbody を `display: none`
  - `.ot-queue-card-list` という list を表示
  - 各カードに: 日付バッジ + 申請者 + 種別/状態 + 時間帯 + 残業 + 現場 + 作業内容 + アクションボタン群
  - アクションボタンは min-height 44px、横並び 3つ均等
- 構造変更: queue-rows.tsx に「カードバージョン」を追加して、CSS 媒体クエリで切替

## H. 残業申請フォーム `/overtime/new`
- スマホ 640px 以下:
  - `.ot-segment` を grid-template-columns: 1fr （既に対応済）
  - `.ot-time-row` を縦並びに変更（既存は横並びのまま窮屈）
  - `.ot-btn-row-end` の > * を width 100% に（既存対応）
  - 時間 input の min-height 48px、font-size 16px (iOS zoom 防止)
  - 確認ステップの `.ot-detail-table` は既に dt/dd 風（対応済）OK

## I. ログイン
- 既存で 520px以下 1列化OK、ロゴ位置調整は CSS のみで微調整
- `.quick-login-btn` min-height 80px → 72px に下げる
- hint改行: 既に `line-height: 1.4` で問題なさそう、要確認

## J. 共通
- インタラクティブ最小サイズ: button / link 共通で min-height 44px
- `.container-wide` のスマホ padding: 20px 16px 48px（既存OK）
- 「次の人に渡す」ログアウト → fixed bottom にはしない（既存の流れに自然）
