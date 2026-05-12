import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "att_session";

const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;
export const SESSION_TTL_SECONDS = TTL_HOURS * 60 * 60;

export type SessionPayload = {
  uid: string;
  rl: "member" | "manager";
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

function signNode(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function issueSession(args: {
  userId: string;
  role: "member" | "manager";
  now?: Date;
}): { cookieValue: string; maxAge: number; expiresAt: Date } {
  const now = args.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { uid: args.userId, rl: args.role, iat, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signNode(payloadB64);
  return {
    cookieValue: `${payloadB64}.${sig}`,
    maxAge: SESSION_TTL_SECONDS,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifySessionNode(
  cookieValue: string,
  now: Date = new Date(),
): SessionPayload | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expected = signNode(payloadB64);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.uid || !payload.exp) return null;
  if (payload.exp * 1000 < now.getTime()) return null;
  return payload;
}
