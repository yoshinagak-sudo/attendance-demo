/**
 * LINE Login (OAuth 2.0 + OpenID Connect) ヘルパー
 * 公式: https://developers.line.biz/ja/docs/line-login/integrate-line-login/
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

export type LineConfig = {
  channelId: string;
  channelSecret: string;
  /** 例: https://attendance-ninau.vercel.app/api/auth/line/callback */
  redirectUri: string;
};

export function getLineConfig(): LineConfig | null {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const redirectUri = process.env.LINE_LOGIN_REDIRECT_URI;
  if (!channelId || !channelSecret || !redirectUri) return null;
  return { channelId, channelSecret, redirectUri };
}

function getStateSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production (>=16 chars)");
    }
    return "dev-only-secret-do-not-use-in-production";
  }
  return s;
}

/** state は CSRF対策に必須。HMAC で署名して cookie に置く */
export function issueState(): { state: string; signed: string } {
  const state = randomBytes(16).toString("base64url");
  const sig = createHmac("sha256", getStateSecret()).update(state).digest("base64url");
  return { state, signed: `${state}.${sig}` };
}

export function verifyState(signedFromCookie: string, stateFromQuery: string): boolean {
  const parts = signedFromCookie.split(".");
  if (parts.length !== 2) return false;
  const [s, sig] = parts;
  if (s !== stateFromQuery) return false;
  const expected = createHmac("sha256", getStateSecret()).update(s).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(cfg: LineConfig, state: string, nonce: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.channelId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: "openid profile",
    nonce,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type LineTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope: string;
  token_type: "Bearer";
};

export async function exchangeCodeForToken(
  cfg: LineConfig,
  code: string,
): Promise<LineTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.channelId,
    client_secret: cfg.channelSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LineTokenResponse;
}

export type LineIdTokenPayload = {
  iss: string;
  sub: string; // LINE userId
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  picture?: string;
  email?: string;
};

/**
 * LINE 専用の id_token 検証エンドポイント。署名検証 + iss / aud / exp を一括で検証してくれる。
 * 公式: https://developers.line.biz/ja/reference/line-login/#verify-id-token
 */
export async function verifyIdToken(
  cfg: LineConfig,
  idToken: string,
  expectedNonce: string,
): Promise<LineIdTokenPayload> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: cfg.channelId,
    nonce: expectedNonce,
  });
  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`id_token verify failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LineIdTokenPayload;
}
