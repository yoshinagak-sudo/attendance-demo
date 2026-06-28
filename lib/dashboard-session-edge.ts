/**
 * proxy.ts (Edge) で dashboard cookie 検証を行うための実装。
 * node:crypto が使えないので Web Crypto API を使う。
 */
export const DASHBOARD_COOKIE_NAME = "att_dashboard";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    return "dev-only-secret-do-not-use-in-production";
  }
  return s;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyDashboardCookieEdge(
  cookieValue: string,
  now: Date = new Date(),
): Promise<boolean> {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const expected = await hmacSha256(payloadB64, getSecret());
  if (!timingSafeEqualStr(sigB64, expected)) return false;

  let payload: { exp?: number };
  try {
    const bytes = base64UrlToBytes(payloadB64);
    const text = new TextDecoder().decode(bytes);
    payload = JSON.parse(text);
  } catch {
    return false;
  }
  if (!payload.exp) return false;
  if (payload.exp * 1000 < now.getTime()) return false;
  return true;
}
