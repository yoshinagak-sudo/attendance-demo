import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  DASHBOARD_COOKIE_NAME,
  verifyDashboardCookie,
} from "@/lib/dashboard-session";
import { DashboardLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function DashboardLoginPage() {
  const store = await cookies();
  const c = store.get(DASHBOARD_COOKIE_NAME)?.value;
  if (c && verifyDashboardCookie(c)) {
    redirect("/dashboard");
  }

  return (
    <main className="dash-login-shell">
      <div className="dash-login-brand">
        <img
          src="/ninau-logo.png"
          alt="株式会社ニナウ"
          className="dash-login-logo"
          width={400}
          height={100}
        />
        <h1 className="dash-login-title">管理ダッシュボード</h1>
        <p className="dash-login-sub">パスワードを入力してください</p>
      </div>
      <DashboardLoginForm />
    </main>
  );
}
