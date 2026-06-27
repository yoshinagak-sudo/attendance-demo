# /settings/account 画面設計

## 目的
ユーザーが「メアド＋パスワード」と「LINE」のどちらのログイン方法でも自分のアカウントに入れる状態を一画面で確認・操作する。

## 触るファイル
- `app/settings/account/page.tsx` (新規 RSC)
- `app/settings/account/unlink-button.tsx` (新規 Client)
- `app/_components/UserMenu.tsx` (1行追加: 設定リンク)
- `app/globals.css` (settings-* セクションを末尾追記。色トークンは追加しない)

## 既存資産の流用
- `.container` / `.header` / `.title` / `.subtitle` / `.link`
- `.section` / `.section-head` / `.section-title` / `.section-sub`
- `.ot-banner` 系（success/danger/info）
- `.ot-btn-primary` / `.ot-btn-danger` / `.ot-btn-row`
- `.admin-users-role-manager`（pill バッジ）
- `.login-line-btn`（LINE 緑 `#06C755`）
- `.badge` / `.badge-in`（連携済みドット付き）

## 画面要素

```
<AppHeader />
<main class="container">

  <header class="header">
    <div>
      <h1 class="title"> 設定 </h1>
      <span class="subtitle">アカウント情報とログイン方法を管理します。</span>
    </div>
    <a class="link"> ← 打刻画面 / ← 管理画面 </a>    # role で出し分け
  </header>

  ### A) ?linked=1 / ?error=... バナー（あれば）
  <div class="ot-banner ot-banner-success|ot-banner-danger" role="status">
    LINE 連携が完了しました / LINE 連携に失敗しました（原因）
  </div>

  ### B) アカウント情報
  <section class="section">
    <div class="section-head"><h2 class="section-title">アカウント情報</h2></div>
    <dl class="settings-info-grid">
      名前 / ロール / メールアドレス / 最終ログイン
    </dl>
  </section>

  ### C) ログイン方法の連携
  <section class="section">
    <div class="section-head">
      <h2 class="section-title">ログイン方法の連携</h2>
      <span class="section-sub">どちらでもログインできます</span>
    </div>

    # ── 行1: メールアドレス ─────────────────────────────────
    <article class="settings-method-row">
      <div class="settings-method-icon"> <Mail /> </div>
      <div class="settings-method-body">
        <div class="settings-method-head">
          メールアドレス
          <span class="admin-users-role-manager">設定済み</span>
        </div>
        <div class="settings-method-sub">{loginId}</div>
      </div>
      <div class="settings-method-action">（操作なし）</div>
    </article>

    # ── 行2: LINE ────────────────────────────────────────
    <article class="settings-method-row">
      <div class="settings-method-icon settings-method-icon-line">
        # 連携済みかつ picture あれば 32x32 丸、なければ Link2 アイコン
        <img src={linePictureUrl} class="settings-line-avatar" /> | <Link2 />
      </div>
      <div class="settings-method-body">
        <div class="settings-method-head">
          LINE
          {linked ? <span class="admin-users-role-manager">連携済み</span>
                  : <span class="settings-badge-unlinked">未連携</span>}
        </div>
        <div class="settings-method-sub">{linked ? user.name : 'LINE でログインできるようにします'}</div>
      </div>
      <div class="settings-method-action">
        {linked
          ? <UnlinkButton />     # client、confirm() してから unlinkLineAction submit
          : <form action={startLinkLineAction}>
              <button class="login-line-btn settings-link-btn"> <LineIcon /> LINE と連携する </button>
            </form>}
      </div>
    </article>
  </section>

</main>
```

## バナー文言マップ（searchParams.error）
- `line_misconfigured` … LINE 連携が設定されていません。管理者にお問い合わせください
- `line_already_linked` … この LINE アカウントは既に別ユーザーに紐付けられています
- `line_state_mismatch` … セッション検証に失敗しました。もう一度お試しください
- `line_verify_failed` … LINE 認証に失敗しました
- その他 `line_*` … LINE 連携で問題が発生しました

## レスポンシブ
- `.settings-method-row` は flex 横並び。640px 以下は縦積み（アイコン → 本文 → アクション）でアクションが全幅ボタンに
- `.settings-info-grid` は CSS Grid `repeat(auto-fit, minmax(180px, 1fr))`

## アクセシビリティ
- バナー: `role="status"` (success) / `role="alert"` (error)、`aria-live="polite"`
- セクション: `aria-labelledby` で `<h2>` と結ぶ
- 解除確認: ネイティブ `confirm()` で「以降は LINE では入れなくなります」
- ボタン pending 中は `aria-busy="true"` + `disabled`
