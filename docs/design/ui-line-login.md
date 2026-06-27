# ログイン画面に LINE ログインボタン追加

## 目的
- ニナウ社デモ用勤怠アプリのログイン画面に、LINE 連携ログインの導線を追加する
- 既存のメアド + パスワードフォームは触らず、選択肢として並置する

## 触るファイル
- `app/login/login-form.tsx` — ボタン下に divider と LINE ボタンを追加
- `app/login/page.tsx` — `?error=line_*` を読んで LoginForm にバナー文言を渡す
- `app/globals.css` — `.login-divider` と `.login-line-btn` を追記

## 画面要素（上から順、変更後）
```
┌───────────────────────────────────────────┐
│  [ニナウロゴ]   勤怠アプリ                       │
├───────────────────────────────────────────┤
│  ┌─ login-card ─────────────────────────┐ │
│  │ (line_error 時のみ) 赤バナー             │ │
│  │ (フォーム error 時のみ) 赤バナー           │ │
│  │                                       │ │
│  │ メールアドレス                            │ │
│  │ [email input ........................] │ │
│  │                                       │ │
│  │ パスワード                               │ │
│  │ [password input ............] [表示]   │ │
│  │                                       │ │
│  │ [ ログイン (primary green) ]            │ │
│  │                                       │ │
│  │ ─────── または ───────                  │ │
│  │                                       │ │
│  │ [ 💬 LINEでログイン (LINE green) ]      │ │
│  │                                       │ │
│  │ ログイン情報を忘れた場合は…                  │ │
│  └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

## 状態
- **idle**: 両ボタン押下可
- **email-form pending**: 既存「ログイン」ボタンが「ログイン中…」+ disabled、
  LINE ボタンは `aria-disabled="true"` で opacity 0.55 + クリック透過遮断
- **line error**: ページ最上部 (フォーム上) に赤バナー、文言は error クエリで分岐

## エラー文言マップ（page.tsx）
| `?error=` 値              | バナー文言                                   |
| ------------------------ | ------------------------------------------ |
| `line_state_mismatch`    | セッション検証に失敗しました。もう一度お試しください    |
| `line_verify_failed`     | LINE認証に失敗しました                          |
| `line_*`（その他）         | LINEログインで問題が発生しました                  |

## デザイントークン
- LINE ブランド緑: `#06C755` (bg), hover `#05B84B`
- ニナウ primary は **使わない**（ブランド分離のため）
- 既存 `--border`/`--muted`/`--r-md` は流用 OK

## アクセシビリティ
- 区切りは `<div className="login-divider" role="separator">` で「または」をセンタリング
- LINE ボタンは `<a>` 要素 + `href`、pending 時は `aria-disabled="true"` + pointer-events:none
- 装飾 SVG は `aria-hidden="true"`、ボタン本文の文字「LINEでログイン」で意味を担保
- フォーカスリングは LINE 緑の rgba(0.28)

## アイコン
- inline SVG の吹き出し型（speech bubble）1個、`currentColor` で塗る → 白文字に同色
- 絵文字は使わない、商標のロゴ画像も使わない
