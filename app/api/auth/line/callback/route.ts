import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getLineConfig,
  verifyState,
  exchangeCodeForToken,
  verifyIdToken,
} from "@/lib/line-oauth";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "line_oauth_state";
const NONCE_COOKIE = "line_oauth_nonce";

function errorRedirect(req: NextRequest, code: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", `line_${code}`);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const cfg = getLineConfig();
  if (!cfg) return errorRedirect(req, "misconfigured");

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // ユーザーが LINE 側で許可拒否したケース
  if (errorParam) return errorRedirect(req, errorParam);
  if (!code || !state) return errorRedirect(req, "missing_params");

  const store = await cookies();
  const signedState = store.get(STATE_COOKIE)?.value;
  const nonce = store.get(NONCE_COOKIE)?.value;
  if (!signedState || !nonce) return errorRedirect(req, "state_missing");
  if (!verifyState(signedState, state)) return errorRedirect(req, "state_mismatch");

  // 使用済み state/nonce は即破棄
  store.delete(STATE_COOKIE);
  store.delete(NONCE_COOKIE);

  let payload;
  try {
    const tokenRes = await exchangeCodeForToken(cfg, code);
    if (!tokenRes.id_token) return errorRedirect(req, "no_id_token");
    payload = await verifyIdToken(cfg, tokenRes.id_token, nonce);
  } catch (e) {
    console.error("[line/callback] token exchange or verify failed:", e);
    return errorRedirect(req, "verify_failed");
  }

  const lineUserId = payload.sub;
  const displayName = payload.name?.trim() || "LINEユーザー";
  const picture = payload.picture ?? null;

  // upsert: 既存ユーザーがあればログイン更新、無ければ新規作成 (role=member)
  const user = await prisma.user.upsert({
    where: { lineUserId },
    update: {
      lastLoginAt: new Date(),
      linePictureUrl: picture,
      // 既存 name が「LINEユーザー」相当（初回作成のみ自動値）の場合だけ上書き
      ...(displayName ? { name: displayName } : {}),
    },
    create: {
      lineUserId,
      name: displayName,
      linePictureUrl: picture,
      role: "member",
      isActive: true,
      lastLoginAt: new Date(),
    },
  });

  if (!user.isActive) return errorRedirect(req, "user_inactive");

  // session 発行
  const role: "member" | "manager" | "developer" =
    user.role === "developer"
      ? "developer"
      : user.role === "manager"
        ? "manager"
        : "member";
  const session = issueSession({ userId: user.id, role });
  store.set(SESSION_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  // role に応じて行き先を変える
  const next = role === "manager" || role === "developer" ? "/admin" : "/";
  return NextResponse.redirect(new URL(next, req.url));
}
