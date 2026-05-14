# ボトムタブバー設計メモ

## 目的
どの画面からでも主要機能にワンタップで切替可能な「アプリらしい」固定ナビゲーション。
商談デモで「機能切替が分かりやすい」と感じてもらうためのもの。

## 表示条件
- session が存在する（ログイン中）
- pathname が `/login` から始まらない
- 上記両方を満たすときのみ描画。それ以外は null

## タブ構成
| アイコン | ラベル | パス       | 表示対象  |
|---------|-------|-----------|----------|
| 🏠       | ホーム | `/`        | 全員     |
| ⏱       | 残業   | `/overtime`| 全員     |
| 🚐       | 車両   | `/vehicle` | 全員     |
| 📝       | 日報   | `/report`  | 全員     |
| 📊       | 管理   | `/admin`   | managerのみ |

→ member は 4 タブ / manager は 5 タブ。`grid-template-columns: repeat(N, 1fr)` で等分。

## アクティブ判定
- `/` は完全一致のみ active
- それ以外は `pathname === path || pathname.startsWith(path + "/")`
- `/admin` 配下（`/admin/users` 等）は「管理」タブを active 扱い

## レイアウト
- `position: fixed; left: 0; right: 0; bottom: 0;`
- 高さ: 60px + `env(safe-area-inset-bottom)` （iOSホームバー対応）
- z-index: 50（既存トースト=100 より下、コンテンツより上）
- 背景: `var(--surface)` + 上辺ボーダー `var(--divider)`、薄い影
- グリッド N 等分、各セル中央寄せ、アイコン上 + 12pxラベル下

## カラー（既存トークンのみ）
- 非アクティブ: アイコン/ラベルとも `var(--muted)`
- アクティブ: アイコン/ラベルとも `var(--primary)`、上端 2px ライン `var(--primary)`、背景 `var(--primary-soft)` 薄掛け
- ホバー: `var(--surface-hover)`

## サイズ
- アイコン: 20px (絵文字: font-size:20px)
- ラベル: 11px / weight 600 / letter-spacing 0.04em
- タップ領域: 高さ60px × 幅 100/N% → 最低 64px 幅確保（タブ5でも390px端末で78px、56pxクリア）

## 干渉対策
- `body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }` をグローバルに追加
- `.container` / `.container-wide` の既存 `padding: 32px 24px 64px` は維持。bodyのpadding-bottomで本体の下端だけ追加で空ける
- `/login` 画面は body にも padding-bottom がかかってしまうが、本人は中央配置のレイアウトなので問題なし（タブが非表示なので余白はあるが目立たない）。気になる場合は client 側で `<html>` に data 属性を立てて切替

## 実装ファイル
1. `app/_components/BottomTabBar.tsx` (新規) — "use client"
   - props: `{ role: "member" | "manager" }`
   - usePathname で active 判定
   - pathname === "/login" or "/login/..." なら null を返す（安全網）
2. `app/layout.tsx` (改修) — async でセッション取得し、BottomTabBar を全ページ共通描画
   - session が null なら null
3. `app/globals.css` (追記) — `.bottom-tab-bar` 系スタイル
   - body padding-bottom も追加

## アクセシビリティ
- `<nav role="navigation" aria-label="主要機能">` でラップ
- 各タブは `<Link>` で href、`aria-current="page"` をアクティブ時に付与
- 絵文字は装飾扱い `aria-hidden="true"` で読み上げから除外し、ラベル文字を読ませる

## ホームショートカットカードとの共存
- `.home-shortcut-*` はそのまま残す（ホーム画面の見せ場 / 大きなCTA）
- ボトムタブは常時動線、ショートカットカードは初回誘導と覚えて、両方残すのが正解

