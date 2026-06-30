/**
 * 管理操作（社員/残業/日報/車両）の共通認可ゲート。
 *
 * 通過条件：
 *   1) 社員アプリの SESSION cookie が manager または developer
 *   2) 統括管理者ダッシュボードの DASHBOARD cookie が有効
 *
 * actions.ts から呼び、principal.kind で「自分自身を操作中か」のような
 * 判定を出し分けるために principal を返す。
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, isAdminRole, type SessionUser } from "@/lib/session";
import {
  DASHBOARD_COOKIE_NAME,
  verifyDashboardCookie,
} from "@/lib/dashboard-session";

/**
 * リクエストのホストが管理ダッシュボード側か。
 * server action 側で「リダイレクト先を /admin/* と /dashboard/* で切替」するために使う。
 */
export async function isDashboardHostRequest(): Promise<boolean> {
  const h = await headers();
  const host = h.get("host") ?? "";
  if (host.startsWith("admin.")) return true;
  if (host.includes("-admin.vercel.app")) return true;
  if (host.includes("-admin-")) return true;
  return false;
}

/** 「ホストに応じた /admin か /dashboard のプレフィックス」を返す。 */
export async function adminPrefix(): Promise<"/admin" | "/dashboard"> {
  return (await isDashboardHostRequest()) ? "/dashboard" : "/admin";
}

export type AdminPrincipal =
  | { kind: "user"; user: SessionUser }
  | { kind: "dashboard" };

export async function getAdminPrincipal(): Promise<AdminPrincipal | null> {
  const session = await getSession();
  if (session && isAdminRole(session.role)) {
    return { kind: "user", user: session };
  }
  const store = await cookies();
  const c = store.get(DASHBOARD_COOKIE_NAME)?.value;
  const dash = c ? verifyDashboardCookie(c) : null;
  if (dash) return { kind: "dashboard" };
  return null;
}

/**
 * 認可必須の関数で使う。失敗時は本人のホスト種別に応じて適切なログインへ。
 * - SESSION も DASHBOARD もない → 社員アプリの /login へ（dashboard host にいる場合は proxy が /dashboard/login に redirect する）
 */
export async function requireAdminOrDashboard(
  nextPath: string,
): Promise<AdminPrincipal> {
  const p = await getAdminPrincipal();
  if (p) return p;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}
