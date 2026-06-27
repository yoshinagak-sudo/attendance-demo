/**
 * アカウント連携設定 /settings/account
 *
 * - 自分のアカウント情報（名前 / ロール / メアド / 最終ログイン）を表示
 * - ログイン方法（メアド・LINE）の連携状態を一覧し、未連携 LINE は連携開始、連携済みは解除
 * - サーバー側は actions.ts の startLinkLineAction / unlinkLineAction を呼ぶだけ
 *   （UI は値の有無を見て出し分けるだけ＝見た目だけ担当）
 *
 * 注意: searchParams は Next.js 16 で Promise なので必ず await する
 */

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { Mail, Link2, ChevronLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireSession, isAdminRole } from "@/lib/session";
import { formatJSTYmdHm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";

import { startLinkLineAction } from "./actions";
import { UnlinkLineButton } from "./unlink-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type SearchParams = Promise<{ linked?: string; error?: string }>;

const ROLE_LABEL: Record<string, string> = {
  manager: "管理者",
  developer: "開発者",
  member: "一般",
};

function roleBadgeClass(role: string): string {
  if (role === "manager") return "admin-users-role-manager";
  if (role === "developer") return "admin-users-role-developer";
  return "admin-users-role-member";
}

/** LINE エラーコードを文言に解決（callback で投入される線群） */
function resolveLineError(value: string | undefined): string | null {
  if (!value) return null;
  if (value === "line_already_linked") {
    return "この LINE アカウントは既に別のユーザーに紐付けられています";
  }
  if (value === "line_misconfigured") {
    return "LINE 連携が設定されていません。管理者にお問い合わせください";
  }
  if (value === "line_state_mismatch") {
    return "セッション検証に失敗しました。もう一度お試しください";
  }
  if (value === "line_verify_failed") {
    return "LINE 認証に失敗しました。時間をおいて再度お試しください";
  }
  if (value === "line_unlink_would_lockout") {
    return "メールアドレス+パスワードが未設定のため LINE 連携を解除できません（解除するとログイン手段がなくなります）";
  }
  if (value === "line_already_linked_self") {
    return "既に別の LINE アカウントを連携済みです。先に解除してから新しいアカウントを連携してください";
  }
  if (value === "line_link_session_lost") {
    return "連携処理中にセッションが切れました。もう一度ログインしてからお試しください";
  }
  if (value.startsWith("line_")) {
    return "LINE 連携で問題が発生しました";
  }
  return null;
}

// LINE 風の吹き出しアイコン（ログイン画面と同じ自前 SVG・商標は使わない）
function LineGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3C6.48 3 2 6.69 2 11.24c0 4.08 3.55 7.5 8.34 8.13.32.07.77.21.88.49.1.25.07.65.03.91l-.14.86c-.04.25-.21.99.87.54 1.07-.45 5.81-3.42 7.93-5.86 1.47-1.62 2.09-3.27 2.09-5.07C22 6.69 17.52 3 12 3z"
      />
    </svg>
  );
}

export default async function SettingsAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const session = await requireSession("/settings/account");
  const params = await searchParams;

  // 最新の lineUserId / linePictureUrl / loginId / lastLoginAt を取り直す
  // （セッションには載っていない & 連携直後の表示で古値を出さないため）
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      role: true,
      loginId: true,
      lastLoginAt: true,
      lineUserId: true,
      linePictureUrl: true,
    },
  });
  if (!user) {
    // session 通過後に消えるケースは要 redirect。requireSession 同等の挙動に合わせる
    await requireSession("/settings/account");
    return null;
  }

  const lineLinked = !!user.lineUserId;
  const linkedSuccess = params.linked === "1";
  const errorMessage = resolveLineError(params.error);

  const isAdmin = isAdminRole(session.role);
  const homeHref = isAdmin ? "/admin" : "/";
  const homeLabel = isAdmin ? "管理画面" : "打刻画面";

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">設定</h1>
            <span className="subtitle">
              アカウント情報とログイン方法を管理します。
            </span>
          </div>
          <Link href={homeHref} className="link">
            <ChevronLeft
              width={14}
              height={14}
              aria-hidden="true"
              style={{ verticalAlign: "-2px", marginRight: 2 }}
            />
            {homeLabel}
          </Link>
        </header>

        {/* バナー: 連携成功 ------------------------------------------------ */}
        {linkedSuccess && (
          <div
            className="ot-banner ot-banner-success"
            role="status"
            aria-live="polite"
          >
            <div className="ot-banner-icon" aria-hidden="true">
              ✓
            </div>
            <div className="ot-banner-body">
              LINE 連携が完了しました。次回からは LINE でもログインできます。
            </div>
          </div>
        )}

        {/* バナー: エラー -------------------------------------------------- */}
        {errorMessage && (
          <div
            className="ot-banner ot-banner-danger"
            role="alert"
            aria-live="polite"
          >
            <div className="ot-banner-icon" aria-hidden="true">
              !
            </div>
            <div className="ot-banner-body">{errorMessage}</div>
          </div>
        )}

        {/* 1) アカウント情報 ---------------------------------------------- */}
        <section className="section" aria-labelledby="settings-info-heading">
          <div className="section-head">
            <h2 id="settings-info-heading" className="section-title">
              アカウント情報
            </h2>
          </div>
          <dl className="settings-info-grid">
            <div className="settings-info-cell">
              <dt className="settings-info-label">名前</dt>
              <dd className="settings-info-value">{user.name}</dd>
            </div>
            <div className="settings-info-cell">
              <dt className="settings-info-label">ロール</dt>
              <dd className="settings-info-value">
                <span className={roleBadgeClass(session.role)}>
                  {ROLE_LABEL[session.role] ?? session.role}
                </span>
              </dd>
            </div>
            <div className="settings-info-cell">
              <dt className="settings-info-label">メールアドレス</dt>
              <dd className="settings-info-value settings-info-value-mono">
                {user.loginId ?? "—"}
              </dd>
            </div>
            <div className="settings-info-cell">
              <dt className="settings-info-label">最終ログイン</dt>
              <dd className="settings-info-value tabular">
                {user.lastLoginAt ? formatJSTYmdHm(user.lastLoginAt) : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* 2) ログイン方法の連携 ----------------------------------------- */}
        <section className="section" aria-labelledby="settings-method-heading">
          <div className="section-head">
            <h2 id="settings-method-heading" className="section-title">
              ログイン方法の連携
            </h2>
            <span className="section-sub">
              どちらでも同じアカウントに入れます
            </span>
          </div>

          <div className="settings-method-list">
            {/* ── 行1: メールアドレス ─────────────────────────────── */}
            <article className="settings-method-row">
              <div className="settings-method-icon" aria-hidden="true">
                <Mail width={20} height={20} />
              </div>
              <div className="settings-method-body">
                <div className="settings-method-head">
                  <span className="settings-method-name">メールアドレス</span>
                  {user.loginId ? (
                    <span className="admin-users-role-manager">設定済み</span>
                  ) : (
                    <span className="settings-badge-unlinked">未設定</span>
                  )}
                </div>
                <div className="settings-method-sub">
                  {user.loginId ? (
                    <span className="settings-method-mono">{user.loginId}</span>
                  ) : (
                    "メアドが未登録です。管理者にお問い合わせください"
                  )}
                </div>
              </div>
              <div className="settings-method-action">
                <span className="settings-method-action-empty">—</span>
              </div>
            </article>

            {/* ── 行2: LINE ─────────────────────────────────────── */}
            <article className="settings-method-row">
              <div
                className={
                  lineLinked && user.linePictureUrl
                    ? "settings-method-icon settings-method-icon-line settings-method-icon-photo"
                    : "settings-method-icon settings-method-icon-line"
                }
                aria-hidden="true"
              >
                {lineLinked && user.linePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- LINE CDN は外部・next/image を使わない
                  <img
                    src={user.linePictureUrl}
                    alt=""
                    className="settings-line-avatar"
                    width={32}
                    height={32}
                  />
                ) : (
                  <Link2 width={20} height={20} />
                )}
              </div>
              <div className="settings-method-body">
                <div className="settings-method-head">
                  <span className="settings-method-name">LINE</span>
                  {lineLinked ? (
                    <span className="admin-users-role-manager">連携済み</span>
                  ) : (
                    <span className="settings-badge-unlinked">未連携</span>
                  )}
                </div>
                <div className="settings-method-sub">
                  {lineLinked
                    ? `${user.name} として連携中`
                    : "LINE でログインできるようにします"}
                </div>
              </div>
              <div className="settings-method-action">
                {lineLinked ? (
                  <UnlinkLineButton />
                ) : (
                  <form
                    action={startLinkLineAction}
                    className="settings-action-form"
                  >
                    <button
                      type="submit"
                      className="login-line-btn settings-link-btn"
                    >
                      <LineGlyph />
                      <span>LINE と連携する</span>
                    </button>
                  </form>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
