# ニナウ社長専用 管理ダッシュボード UI 設計

社員向け勤怠アプリ（メインドメイン）と独立した `*-admin.vercel.app` で動く、
代表者専用の read-only 閲覧 Web。proxy が `/dashboard/*` に rewrite するため、
ナビゲーション href は `/dashboard`, `/dashboard/monthly`, `/dashboard/vehicle`, `/dashboard/pending` を使う。

## 視覚言語

- ブランド色 `--primary` = #54bb39（ニナウ緑）はアクセントとして使用
- サイドナビは **暗緑** (`#1f2a1c` = `--text` を流用) で「専用感」を出す
- 業務系（CRM/受発注/勤怠管理画面）と同じトークン群（`--surface`, `--border`, `--muted` 等）に合流
- 既存 `.card` `.badge` 系は再利用せず、`dash-*` で名前空間を分けて衝突を防ぐ
- フォントサイズ階梯: 11 / 12 / 13 / 14 / 16 / 22 / 30 (KPI数値) / 32 (タイトル)
- font-weight: 500 / 600 / 700
- 余白: 4 / 8 / 12 / 16 / 24 / 32

## 画面シェル

```
┌─────────────┬──────────────────────────────────────────────┐
│  サイドナビ │  メインコンテンツ                              │
│  240px      │  max-width 1200px / 左右 padding 32px          │
│  暗緑       │  bg=--bg                                       │
│  100vh sticky                                                │
└─────────────┴──────────────────────────────────────────────┘
```

スマホ（< 1024px）：サイドナビは drawer 化。上部に細い `dash-mobile-bar` を出し、
ハンバーガー押下で左から `.dash-nav.is-open` がスライド表示。背後 overlay。

## サイドナビ要素

- ロゴ画像 `/ninau-logo.png` (横幅 168px) + サブテキスト「管理ダッシュボード」
- リンク群（4個）。lucide-react で先頭アイコン。active 時は `--primary` 背景 + 左 3px のブランドライン。
  - Home: 出勤状況 (/dashboard)
  - Calendar: 月次集計 (/dashboard/monthly)
  - Truck: 車両状況 (/dashboard/vehicle)
  - Inbox: 未対応 (/dashboard/pending)
- ナビ末尾：社長メアド（小）+ `<form action={dashboardLogoutAction}>` のログアウトボタン（LogOut アイコン）

## ページ別の情報構造

### 1. /dashboard（出勤状況・トップ）

- ヘッダ：「今日の出勤状況」(タイトル) + 「YYYY年M月D日（曜）」(サブ)
- KPI カード 4枚（横並び 1280px / 〜640px は 2列）
  - 出勤中 / 退勤済 / 未出勤 / 本日の合計勤務時間
- セクションタイトル「今日の打刻」
- テーブル（社員別、当日打刻ありの人を1行ずつ）
  - 社員 / 出勤 / 退勤 / 勤務時間 / 状態
  - 状態バッジ：出勤中（green）/ 退勤済（grey）

### 2. /dashboard/monthly（月次集計）

- ヘッダ：「月次集計」+ 対象「YYYY年M月」
- KPI カード 4枚：稼働社員数 / 総勤務日数 / 総勤務時間 / 総残業時間
- テーブル（社員別）
  - 社員 / 勤務日数 / 勤務時間 / 残業時間
  - 最下行は「合計」（背景を `--surface-alt`、`font-weight 700`）

### 3. /dashboard/vehicle（車両状況）

- ヘッダ：「車両状況」+ 「車検期限と稼働状況」
- KPI カード 3枚：総数 / 使用中 / 車検警告
- テーブル（車両別）
  - プレート / モデル / 拠点 / 使用者 / 車検期限 / 直近30日km
  - 車検期限が 30日以内＝amber、過ぎてる＝red、それ以外はそのまま

### 4. /dashboard/pending（未対応）

- ヘッダ：「未対応」+ 「社長確認待ちの件数」
- 大カード 2枚（横並び 2列 / sm 1列）
  - 残業申請 N件（説明：現場から提出され、まだ承認/差戻されていません）
  - 日報未確認 N件（説明：未確認のまま蓄積している日報の件数）
  - 件数 30px ＋ ラベル + 補足 1文

### 5. /dashboard/login（既存・CSSのみ追加）

- 暗緑背景 + 中央にロゴ + 白カード
- ニナウロゴ + 「管理ダッシュボード」+ 「代表者専用ログイン」サブ
- メアド + パスワード + ログインボタン

## 状態（空・エラー）

- 表データが0件 → `.dash-empty`（dashed border、padding 32px）で「対象データがありません」
- KPI 数値が 0 → 数値はそのまま 0、補足が「—」相当の場合は `--muted-2` で淡く

## 実装ファイル

- `app/dashboard/dashboard.css`（新規・全 dashboard 用 CSS をここに集約）
- `app/dashboard/layout.tsx`（RSC、shell 構築）
- `app/dashboard/_components/SideNav.tsx`（client、active判定+drawer開閉）
- `app/dashboard/_components/LogoutForm.tsx`（client、useFormStatus）
- `app/dashboard/page.tsx`（RSC）
- `app/dashboard/monthly/page.tsx`（RSC）
- `app/dashboard/vehicle/page.tsx`（RSC）
- `app/dashboard/pending/page.tsx`（RSC）
