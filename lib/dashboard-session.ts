/**
 * 管理ダッシュボード（admin.〜）専用 セッション
 *
 * - 社員アプリの User 認証とは独立した別系統
 * - 合言葉のみで入る（メアド不要）:
 *     NINAU_OWNER_PASSWORD_HASH  パスワード（PBKDF2 ハッシュ済み）
 * - cookie: att_dashboard、24時間有効、HMAC-SHA256 署名
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/password";

export const DASHBOARD_COOKIE_NAME = "att_dashboard";
export const DASHBOARD_TTL_SECONDS = 24 * 60 * 60;

type DashPayload = {
  iat: number;
  exp: number;
};

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production (>=16 chars)");
    }
    return "dev-only-secret-do-not-use-in-production";
  }
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

/** env からハッシュ済みパスワードを読み、入力と一致するかを返す */
export function checkOwnerPassword(password: string): boolean {
  const expectedHash = process.env.NINAU_OWNER_PASSWORD_HASH ?? "";
  if (!expectedHash) return false;
  return verifyPassword(expectedHash, password);
}

export function issueDashboardCookie(
  now: Date = new Date(),
): { cookieValue: string; maxAge: number; expiresAt: Date } {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + DASHBOARD_TTL_SECONDS;
  const payload: DashPayload = { iat, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = sign(payloadB64);
  return {
    cookieValue: `${payloadB64}.${sig}`,
    maxAge: DASHBOARD_TTL_SECONDS,
    expiresAt: new Date(exp * 1000),
  };
}

export type DashboardSession = {
  iat: number;
  exp: number;
};

export function verifyDashboardCookie(
  cookieValue: string,
  now: Date = new Date(),
): DashboardSession | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: DashPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp) return null;
  if (payload.exp * 1000 < now.getTime()) return null;
  return payload;
}
