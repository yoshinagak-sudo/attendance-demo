# 残業申請 / 管理者画面群 UIワイヤーフレーム

最終更新: 2026-04-26

申請者画面（`/overtime`, `/overtime/new`, `/overtime/[id]`）と完全に同じ語彙で、管理者向け画面を4つ追加する。

- `/admin/overtime/auth` — PINゲート（公開、cookieが無い時のみ）
- `/admin/overtime` — 承認キュー（PIN通過後）
- `/admin/overtime/report` — 月次レポート + CSV
- `/admin/settings/overtime` — 設定（所定終業時刻 / 現場名マスタ）

## デザイン語彙

- 既存トークン（`--primary` / `--warn` / `--danger` / surface系）のみ。新色禁止
- 既存 `ot-*` クラスを最大限再利用。新規追加は最小限（CSSの末尾に短いブロックで）
- レイアウトは `.container-wide` 系（テーブル多め）、PIN画面のみ単独カード
- KPIカードは `.cards/.card`、セクションヘッダは `.section/.section-head/.section-title/.section-sub`、テーブルは `.table-wrap/.table` を踏襲

## 画面1: PINゲート (`/admin/overtime/auth`)

```
┌──────────────────────────────────┐
│           管理者認証              │
│  残業申請の承認に必要です          │
│                                   │
│  ┌─────────────────────────┐     │
│  │  [ DEMO MODE: PIN未設定 ] │ (条件付き)
│  │  そのまま「認証する」を押すと  │
│  │  通せます                 │     │
│  └─────────────────────────┘     │
│                                   │
│  PIN（4桁）                        │
│  [ ●●●● ]                         │
│                                   │
│  [ 認証する ] (primary, block)     │
│                                   │
│  ← 管理ダッシュボード              │
└──────────────────────────────────┘
```

- centred card, max-width 420px, padding 32px
- input は `ot-input` 流用、type=password inputMode=numeric maxLength=4 letter-spacing大きめ
- error は `ot-banner-danger` で上部に
- demo banner は `ot-banner-info`

## 画面2: 承認キュー (`/admin/overtime`)

```
[ヘッダー]
  残業申請 承認キュー                          [月次レポート] [設定] [← 管理]
  事前/事後申請の承認・差戻

[KPIカード ×4]
  申請中  本日承認  本日差戻  月次承認分

[承認者として記録するユーザー]
  [ Select: 田中マネージャー ▾ ]   (localStorageに保存)

[フィルタ tabs]  ● 申請中のみ  ○ すべて

[テーブル]
  業務日 | 申請者 | 種別 | 時間帯 | 残業 | 現場 | 作業内容 | 状態 | アクション
  4/26  | 山田  | [事前] | 17:30〜19:30 | 2:00 | 東館  | 棚卸… | [申請中] | [承認][差戻][却下]
                                                                  └ クリックで↓展開
  ┌── インライン展開 ────────────────────────────────────────┐
  │ 差戻コメント (200字以内)                                  │
  │ [textarea]                                                │
  │ [ キャンセル ] [ 差戻を確定 ]                              │
  └──────────────────────────────────────────────────────────┘
```

- ステータスフィルタ: `pending` (default) / `all`
- 各行のアクションは `<ReviewActions>` (Client) で展開トグル
- 承認ボタンは即時 form action（ot-btn-primary小型）。差戻/却下は展開→コメント→確定の2段
- ?reviewed=1 → `ot-banner-success` トースト
- ?error=... → `ot-banner-danger`

## 画面3: 月次レポート (`/admin/overtime/report`)

```
[ヘッダー]
  残業 月次レポート                          [CSV(承認済)] [全件CSV] [← 承認キュー]
  実労働 vs 申請残業の突合

[月セレクタ]
  [‹ 前月]   [ 2026年04月 ]   [翌月 ›]   ← input month or button

[月次合計バッジ ×4]
  承認済 残業合計  申請中 残業  却下 残業  差分注意者数

[テーブル]
  氏名   | 出勤日数 | 実労働   | 承認済残業 | 申請中  | 差分
  山田   |  20日    | 168:30   | 12:00     | 0:00    | ⚠ +1:30
  田中   |  18日    | 144:00   |  0:00     | 2:30    | 0:00
  ...
```

- 差分が正の行は `ot-row-warn` 帯（`background: var(--warn-bg)` 軽め）
- 差分セルは `text-warn` 強調 + `⚠`
- CSV ボタンは `ot-btn-secondary`（小型）
- 月切替: `?ym=YYYY-MM` で再読み込み（前月/翌月リンク + `<input type="month">` の form）

## 画面4: 設定 (`/admin/settings/overtime`)

```
[ヘッダー]
  残業設定                                  [← 承認キュー]
  所定終業時刻・現場名マスタ

[セクション: 所定終業時刻]
  現在: 17:30
  [ time input: 17:30 ] [ 保存 ]

[セクション: 現場名マスタ]
  [ 現場名を追加 (input) ] [ + 追加 ]

  ┌── テーブル ──────────────────────────────────┐
  │ 現場名      | 利用回数 | 状態     | アクション   │
  │ 東館       |   12    | 有効     | [ 無効化 ]   │
  │ 西館 (薄)  |    3    | 無効     | -            │
  └──────────────────────────────────────────────┘
```

- ot-form-card 内に `ot-section-title` で2セクション分割
- 現場一覧テーブル: 既存 `.table` 流用、無効行は opacity:0.5 + 「無効」バッジ
- 保存後 ?saved=1 → `ot-banner-success`
- ?error=... → `ot-banner-danger`

## 追加するCSS（最小限）

`app/globals.css` 末尾の "残業申請" セクションに追記:

- `.ot-auth-card` — PIN画面の中央寄せカード
- `.ot-auth-input` — PIN入力（letter-spacing広め）
- `.ot-admin-toolbar` — 承認者選択 + フィルタの帯
- `.ot-filter-tabs` — `pending|all` セグメント
- `.ot-action-row` — テーブル内3ボタン横並び
- `.ot-review-expand` — テーブル下の展開エリア（`<tr>` の追加行を仮想的に色分け）
- `.ot-month-nav` — 月切替（`< [Apr 2026] >`）
- `.ot-row-warn` — 差分注意行のハイライト
- `.ot-site-row-inactive` — 無効化現場行の薄表示

新規色は無し。既存トークンの組み合わせのみ。

## 状態の網羅

- 空（申請0件 / 現場0件 / 月内データ0件）→ `.ot-empty`
- ローディング → SSR完結なのでskeletonは不要。Server Action中はpending UIを `useFormStatus`
- エラー → ?error=... を `.ot-banner-danger` で表示
- 成功 → ?reviewed=1 / ?saved=1 を `.ot-banner-success` で表示
- 認証なし → `redirect('/admin/overtime/auth?next=...')`
