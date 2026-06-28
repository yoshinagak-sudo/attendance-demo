"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DASHBOARD_COOKIE_NAME,
  DASHBOARD_TTL_SECONDS,
  checkOwnerPassword,
  issueDashboardCookie,
} from "@/lib/dashboard-session";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

const MIN_LATENCY_MS = 500;

async function sleepUntil(startMs: number) {
  const elapsed = Date.now() - startMs;
  if (elapsed < MIN_LATENCY_MS) {
    await new Promise((r) => setTimeout(r, MIN_LATENCY_MS - elapsed));
  }
}

export type DashboardLoginState = { ok: false; error: string } | null;

export async function dashboardLoginAction(
  _prev: DashboardLoginState,
  formData: FormData,
): Promise<DashboardLoginState> {
  const startMs = Date.now();
  const password = String(formData.get("password") ?? "");

  if (!password) {
    await sleepUntil(startMs);
    return { ok: false, error: "パスワードを入力してください" };
  }

  if (!checkOwnerPassword(password)) {
    await sleepUntil(startMs);
    return { ok: false, error: "パスワードが正しくありません" };
  }

  const session = issueDashboardCookie();
  const store = await cookies();
  store.set(DASHBOARD_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DASHBOARD_TTL_SECONDS,
  });

  // 既存の /admin/* 配下を利用できるよう、synthetic owner user の User session も発行
  const ownerUserId = process.env.OWNER_USER_ID;
  if (ownerUserId) {
    const userSession = issueSession({ userId: ownerUserId, role: "developer" });
    store.set(SESSION_COOKIE_NAME, userSession.cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  await sleepUntil(startMs);
  redirect("/dashboard");
}

export async function dashboardLogoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(DASHBOARD_COOKIE_NAME);
  store.delete(SESSION_COOKIE_NAME);
  redirect("/dashboard/login");
}
