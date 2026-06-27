"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  getLineConfig,
  issueState,
  buildAuthorizeUrl,
} from "@/lib/line-oauth";

const STATE_COOKIE = "line_oauth_state";
const NONCE_COOKIE = "line_oauth_nonce";
const MODE_COOKIE = "line_oauth_mode";
const TTL_SECONDS = 5 * 60;

/** 設定画面から LINE 連携を開始（連携モードで callback に戻ってくる） */
export async function startLinkLineAction(): Promise<void> {
  const session = await requireSession("/settings/account");
  // 既に LINE 連携済みなら、解除→再連携の手順を踏ませる
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (user?.lineUserId) {
    redirect("/settings/account?error=line_already_linked_self");
  }
  const cfg = getLineConfig();
  if (!cfg) {
    redirect("/settings/account?error=line_misconfigured");
  }

  const { state, signed } = issueState();
  const nonce = randomBytes(16).toString("base64url");
  const authorizeUrl = buildAuthorizeUrl(cfg, state, nonce);

  const store = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  };
  store.set(STATE_COOKIE, signed, cookieOpts);
  store.set(NONCE_COOKIE, nonce, cookieOpts);
  store.set(MODE_COOKIE, "link", cookieOpts);

  redirect(authorizeUrl);
}

/** LINE 連携解除（現User の lineUserId を null に）
 *  ロックアウト防止: loginId+passwordHash が無い LINE only user は解除不可。
 */
export async function unlinkLineAction(): Promise<void> {
  const session = await requireSession("/settings/account");
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) redirect("/settings/account?error=user_not_found");
  if (!user.loginId || !user.passwordHash) {
    redirect("/settings/account?error=line_unlink_would_lockout");
  }
  await prisma.user.update({
    where: { id: session.id },
    data: { lineUserId: null, linePictureUrl: null },
  });
  revalidatePath("/settings/account");
}
