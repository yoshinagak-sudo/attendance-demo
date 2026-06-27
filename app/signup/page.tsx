/**
 * 新規ユーザー登録 /signup
 *
 * - メアド + パスワード方式での新規アカウント作成
 * - 成功時は actions.ts の signupAction が自動でセッションを発行し / にリダイレクト
 *   （= 成功時はこのページは描画されない）
 * - 既にログイン済みの場合は / に飛ばす
 * - ログイン画面と同じビジュアル骨格（ロゴ + 「勤怠アプリ」 + .login-card）
 *
 * 注意: Next.js 16 の searchParams/params 取り扱いに合わせ、可能な限り
 *   キャッシュを無効化する（force-dynamic + noStore）。
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getSession } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // cookies() を呼ぶことで Next.js に dynamic を強制（pre-render回避）
  await cookies();
  const session = await getSession();
  if (session) {
    redirect("/");
  }

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
      <SignupForm />
      <p className="login-secondary-link">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" className="login-secondary-link-anchor">
          ログイン
        </Link>
      </p>
    </main>
  );
}
