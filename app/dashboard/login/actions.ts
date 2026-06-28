"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DASHBOARD_COOKIE_NAME,
  DASHBOARD_TTL_SECONDS,
  checkOwnerCredentials,
  issueDashboardCookie,
} from "@/lib/dashboard-session";

const MIN_LATENCY_MS = 500;

async function sleepUntil(startMs: number) {
  const elapsed = Date.now() - startMs;
  if (elapsed < MIN_LATENCY_MS) {
    await new Promise((r) => setTimeout(r, MIN_LATENCY_MS - elapsed));
  }
}

export type DashboardLoginState =
  | { ok: false; error: string }
  | null;

export async function dashboardLoginAction(
  _prev: DashboardLoginState,
  formData: FormData,
): Promise<DashboardLoginState> {
  const startMs = Date.now();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    await sleepUntil(startMs);
    return { ok: false, error: "メールアドレスとパスワードを入力してください" };
  }

  if (!checkOwnerCredentials(email, password)) {
    await sleepUntil(startMs);
    return { ok: false, error: "ログイン情報が正しくありません" };
  }

  const session = issueDashboardCookie(email);
  const store = await cookies();
  store.set(DASHBOARD_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DASHBOARD_TTL_SECONDS,
  });

  await sleepUntil(startMs);
  redirect("/dashboard");
}

export async function dashboardLogoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(DASHBOARD_COOKIE_NAME);
  redirect("/dashboard/login");
}
