import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  DASHBOARD_COOKIE_NAME,
  verifyDashboardCookie,
} from "@/lib/dashboard-session";
import { SideNav } from "./_components/SideNav";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "管理ダッシュボード - 株式会社ニナウ",
  description: "代表者専用 管理ダッシュボード",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ログイン画面でも layout は走るが、サイドナビは認証済み時のみ描画する。
  // ログイン画面はサイドナビ無しの専用シェルを使う。
  const store = await cookies();
  const cookie = store.get(DASHBOARD_COOKIE_NAME)?.value;
  const session = cookie ? verifyDashboardCookie(cookie) : null;

  if (!session) {
    // login ページ等は children だけ返す（自前の dash-login-shell を使う）
    return <>{children}</>;
  }

  return (
    <div className="dash-shell">
      <SideNav />
      <main className="dash-main">{children}</main>
    </div>
  );
}
