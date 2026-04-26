import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "ot_admin";
const COOKIE_TTL_SECONDS = 4 * 60 * 60;

function getSecret(): string {
  return process.env.OVERTIME_APPROVER_SECRET || "demo-secret-do-not-use-in-prod";
}

function getPin(): string | null {
  const v = process.env.OVERTIME_APPROVER_PIN;
  return v && v.length > 0 ? v : null;
}

export function isAdminPinRequired(): boolean {
  return getPin() !== null;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function verifyToken(token: string, now: Date = new Date()): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  const expiresAtMs = Number(Buffer.from(payload, "base64url").toString("utf8"));
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs > now.getTime();
}

export function issueToken(now: Date = new Date()): { token: string; maxAge: number } {
  const expiresAtMs = now.getTime() + COOKIE_TTL_SECONDS * 1000;
  const payload = Buffer.from(String(expiresAtMs), "utf8").toString("base64url");
  const signature = sign(payload);
  return { token: `${payload}.${signature}`, maxAge: COOKIE_TTL_SECONDS };
}

export function checkPin(input: string): boolean {
  const expected = getPin();
  if (expected === null) return true;
  if (input.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(expected));
}

export async function hasAdminAccess(now: Date = new Date()): Promise<boolean> {
  if (!isAdminPinRequired()) return true;
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  return verifyToken(value, now);
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;

const RATE_LIMIT_PER_MIN = 10;
const RATE_WINDOW_MS = 60 * 1000;
const attempts = new Map<string, number[]>();

export function rateLimit(key: string, now: Date = new Date()): boolean {
  const t = now.getTime();
  const list = attempts.get(key) ?? [];
  const recent = list.filter((ts) => t - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_PER_MIN) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(t);
  attempts.set(key, recent);
  return true;
}
