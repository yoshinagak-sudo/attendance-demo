import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
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
const MODE_COOKIE = "line_oauth_mode";

function errorRedirect(req: NextRequest, code: string, mode: "login" | "link") {
  const base = mode === "link" ? "/settings/account" : "/login";
  const url = new URL(base, req.url);
  url.searchParams.set("error", `line_${code}`);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  const modeRaw = store.get(MODE_COOKIE)?.value;
  const mode: "login" | "link" = modeRaw === "link" ? "link" : "login";

  const cfg = getLineConfig();
  if (!cfg) return errorRedirect(req, "misconfigured", mode);

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // ユーザーが LINE 側で許可拒否したケース
  if (errorParam) return errorRedirect(req, errorParam, mode);
  if (!code || !state) return errorRedirect(req, "missing_params", mode);

  const signedState = store.get(STATE_COOKIE)?.value;
  const nonce = store.get(NONCE_COOKIE)?.value;
  if (!signedState || !nonce) return errorRedirect(req, "state_missing", mode);
  if (!verifyState(signedState, state)) return errorRedirect(req, "state_mismatch", mode);

  // 使用済み state/nonce/mode は即破棄
  store.delete(STATE_COOKIE);
  store.delete(NONCE_COOKIE);
  store.delete(MODE_COOKIE);

  let payload;
  try {
    const tokenRes = await exchangeCodeForToken(cfg, code);
    if (!tokenRes.id_token) return errorRedirect(req, "no_id_token", mode);
    payload = await verifyIdToken(cfg, tokenRes.id_token, nonce);
  } catch (e) {
    console.error("[line/callback] token exchange or verify failed:", e);
    return errorRedirect(req, "verify_failed", mode);
  }

  const lineUserId = payload.sub;
  const displayName = payload.name?.trim() || "LINEユーザー";
  const picture = payload.picture ?? null;

  // 連携モード（mode=link）: 現セッションの User に lineUserId を紐付ける
  if (mode === "link") {
    const currentSession = await getSession();
    if (!currentSession) {
      // mode=link のはずが session が無い → 異常系
      return errorRedirect(req, "link_session_lost", "link");
    }
    // 別 User が既に同じ lineUserId を持っている場合は衝突
    const conflict = await prisma.user.findUnique({ where: { lineUserId } });
    if (conflict && conflict.id !== currentSession.id) {
      return errorRedirect(req, "already_linked", "link");
    }
    // 自分自身が既に別 LINE userId を持っている場合は再連携を拒否（解除→再連携を踏ませる）
    const me = await prisma.user.findUnique({ where: { id: currentSession.id } });
    if (me?.lineUserId && me.lineUserId !== lineUserId) {
      return errorRedirect(req, "already_linked_self", "link");
    }
    await prisma.user.update({
      where: { id: currentSession.id },
      data: {
        lineUserId,
        linePictureUrl: picture,
        lastLoginAt: new Date(),
      },
    });
    const url = new URL("/settings/account", req.url);
    url.searchParams.set("linked", "1");
    return NextResponse.redirect(url);
  }

  // セッション無し: upsert で既存LINEユーザー検出 or 新規作成 (role=member)
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

  if (!user.isActive) return errorRedirect(req, "user_inactive", "login");

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
