import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DASHBOARD_COOKIE_NAME,
  verifyDashboardCookie,
  type DashboardSession,
} from "@/lib/dashboard-session";

export async function requireDashboardSession(): Promise<DashboardSession> {
  const store = await cookies();
  const c = store.get(DASHBOARD_COOKIE_NAME)?.value;
  const payload = c ? verifyDashboardCookie(c) : null;
  if (!payload) redirect("/dashboard/login");
  return payload;
}
