import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionEdge } from "@/lib/session-edge";
import {
  DASHBOARD_COOKIE_NAME,
  verifyDashboardCookieEdge,
} from "@/lib/dashboard-session-edge";

/**
 * ホスト名で2系統に分岐：
 *  - admin.* / *-admin.vercel.app … 統括管理者専用ダッシュボード（dashboard cookie 必須）
 *  - それ以外 … 既存の社員向け勤怠アプリ（User session 必須）
 */
function isDashboardHost(host: string): boolean {
  if (host.startsWith("admin.")) return true;
  if (host.includes("-admin.vercel.app")) return true;
  if (host.includes("-admin-")) return true;
  return false;
}

const APP_PUBLIC_EXACT = ["/favicon.ico", "/robots.txt"];
const APP_PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/demo-login",
  "/api/auth/line",
];

const DASH_PUBLIC_PREFIXES = [
  "/dashboard/login",
  "/api/dashboard/login",
  "/api/dashboard/logout",
];

function isAppPublic(pathname: string): boolean {
  if (APP_PUBLIC_EXACT.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  for (const p of APP_PUBLIC_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

function isDashPublic(pathname: string): boolean {
  if (APP_PUBLIC_EXACT.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  for (const p of DASH_PUBLIC_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const pathname = request.nextUrl.pathname;

  // === Dashboard ホスト（admin.〜） ===
  if (isDashboardHost(host)) {
    // 全てのリクエストを /dashboard/* に rewrite
    // 例: /         → /dashboard
    //     /monthly  → /dashboard/monthly
    //     /login    → /dashboard/login
    //     /api/dashboard/login → そのまま（rewrite 不要）

    // 認証なしで通せるパス
    if (isDashPublic(pathname)) {
      // /login → /dashboard/login 等への rewrite だけ行い、認証は通す
      return rewriteToDashboard(request, pathname);
    }

    // dashboard cookie 必須
    const dashCookie = request.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
    const ok = dashCookie ? await verifyDashboardCookieEdge(dashCookie) : false;
    if (!ok) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/login";
      url.search = "";
      if (pathname !== "/" && pathname !== "/login") {
        url.searchParams.set("next", pathname + request.nextUrl.search);
      }
      return NextResponse.redirect(url);
    }
    return rewriteToDashboard(request, pathname);
  }

  // === 既存アプリホスト ===
  if (isAppPublic(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = cookie ? await verifySessionEdge(cookie) : null;

  if (!payload) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  if (
    pathname.startsWith("/admin") &&
    payload.rl !== "manager" &&
    payload.rl !== "developer"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

function rewriteToDashboard(request: NextRequest, pathname: string) {
  // 既に /dashboard で始まっていたらそのまま通す（直アクセス用）
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return NextResponse.next();
  }
  // /api/dashboard/* はそのまま通す（rewrite対象外）
  if (pathname.startsWith("/api/dashboard/")) {
    return NextResponse.next();
  }
  // 社員アプリ側ルート（/admin, /overtime, /vehicle, /report, /api/admin 等）への
  // サブドメイン経由アクセスは禁止。dashboard 内で完結させる。
  // すべて /dashboard 配下に書き換え、未実装の場合は 404 になる。
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/dashboard" : `/dashboard${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)"],
};
