"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import {
  getLineConfig,
  issueState,
  buildAuthorizeUrl,
} from "@/lib/line-oauth";

const STATE_COOKIE = "line_oauth_state";
const NONCE_COOKIE = "line_oauth_nonce";
const TTL_SECONDS = 5 * 60;

export async function startLineLoginAction(): Promise<void> {
  const cfg = getLineConfig();
  if (!cfg) {
    redirect("/login?error=line_misconfigured");
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

  redirect(authorizeUrl);
}
