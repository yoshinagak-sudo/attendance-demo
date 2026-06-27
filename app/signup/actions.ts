"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

const NAME_MIN = 1;
const NAME_MAX = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PW_MIN = 8;
const PW_MAX = 100;
const MIN_LATENCY_MS = 500;

async function sleepUntil(startMs: number) {
  const elapsed = Date.now() - startMs;
  if (elapsed < MIN_LATENCY_MS) {
    await new Promise((r) => setTimeout(r, MIN_LATENCY_MS - elapsed));
  }
}

const DUP_ERROR = "登録に失敗しました。別のメールアドレスをお試しください";

export type SignupState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const startMs = Date.now();
  const name = String(formData.get("name") ?? "").trim();
  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, error: "名前を入力してください（60文字以内）" };
  }
  if (!EMAIL_RE.test(loginId) || loginId.length > 254) {
    return { ok: false, error: "正しいメールアドレスを入力してください" };
  }
  if (password.length < PW_MIN || password.length > PW_MAX) {
    return { ok: false, error: `パスワードは${PW_MIN}文字以上${PW_MAX}文字以内です` };
  }
  if (password !== passwordConfirm) {
    return { ok: false, error: "パスワードが一致しません" };
  }

  // race condition 対策: create を直接呼んで P2002 を捕捉する
  let createdId: string;
  try {
    // passwordHash を先に算出（user enumeration 防止: 重複ありなしで latency を平準化）
    const pwHash = hashPassword(password);
    const created = await prisma.user.create({
      data: {
        name,
        loginId,
        passwordHash: pwHash,
        // signup 直後の session 無効化を避けるため、passwordUpdatedAt は null のまま
        role: "member",
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await sleepUntil(startMs);
      return { ok: false, error: DUP_ERROR };
    }
    throw e;
  }

  // 自動ログイン: session 発行
  const session = issueSession({ userId: createdId, role: "member" });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  await sleepUntil(startMs);
  redirect("/");
}
