/**
 * LINE 初回ログイン後の名前確定画面 /signup/line
 *
 * - LINE ログイン callback で pending cookie (line_pending_signup) を仮置きされたユーザーが、
 *   会社で表示される正式な名前を入力して User レコードを作成するための画面
 * - 既ログイン（session あり） → / に戻す
 * - pending cookie が無い／切れている → /login?error=line_pending_expired
 * - ログイン画面と同じビジュアル骨格（login-shell + login-brand + login-card）
 * - LINE プロフィール写真があれば、入力フォームの上に小さく表示する
 *
 * 注意: actions.ts は触らない（finishLineSignupAction は成功時に redirect("/") するため、
 *       Client 側は ok:true を受け取らない前提）。
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getSession } from "@/lib/session";
import { getPendingLineSignup } from "./actions";
import { LineSignupForm } from "./line-signup-form";

export const dynamic = "force-dynamic";

export default async function LineSignupPage() {
  // cookies() を await することで、このルートを完全に動的化（pre-render 回避）
  await cookies();

  const session = await getSession();
  if (session) {
    // 既にログイン済み = 名前確定は既に完了しているか、別の経路でログインしている
    redirect("/");
  }

  const pending = await getPendingLineSignup();
  if (!pending) {
    // pending cookie が無いか期限切れ → ログイン画面に戻して LINE からやり直してもらう
    redirect("/login?error=line_pending_expired");
  }

  const initialName = pending.displayName ?? "";
  const picture = pending.picture ?? null;

  return (
    <main className="login-shell">
      <div className="login-brand">
        <img
          src="/ninau-logo.png"
          alt="株式会社ニナウ"
          className="login-brand-logo"
          width={546}
          height={136}
        />
        <h1 className="login-brand-title">勤怠アプリ</h1>
      </div>

      <div className="login-card">
        {picture ? (
          <div className="login-line-account" aria-label="あなたのLINEアカウント情報">
            <img
              src={picture}
              alt=""
              className="settings-line-avatar"
              width={40}
              height={40}
              referrerPolicy="no-referrer"
            />
            <div className="login-line-account-body">
              <p className="login-line-account-label">あなたの LINE アカウント情報</p>
              {pending.displayName ? (
                <p className="login-line-account-name">{pending.displayName}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="login-line-account-label" style={{ margin: 0 }}>
            あなたの LINE アカウント情報を取得しました
          </p>
        )}

        <LineSignupForm initialName={initialName} />
      </div>
    </main>
  );
}
