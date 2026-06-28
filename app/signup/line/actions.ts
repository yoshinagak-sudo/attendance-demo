"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

const PENDING_COOKIE = "line_pending_signup";
const NAME_MIN = 1;
const NAME_MAX = 60;

export type LineSignupState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

type PendingPayload = {
  lineUserId: string;
  displayName?: string;
  picture?: string | null;
};

async function readPending(): Promise<PendingPayload | null> {
  const store = await cookies();
  const raw = store.get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as PendingPayload;
    if (!obj.lineUserId) return null;
    return obj;
  } catch {
    return null;
  }
}

export async function getPendingLineSignup(): Promise<PendingPayload | null> {
  return readPending();
}

export async function finishLineSignupAction(
  _prev: LineSignupState,
  formData: FormData,
): Promise<LineSignupState> {
  const pending = await readPending();
  if (!pending) {
    return { ok: false, error: "セッションが切れました。もう一度 LINE ログインからやり直してください" };
  }
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, error: "名前を入力してください（60文字以内）" };
  }

  let createdId: string;
  try {
    const created = await prisma.user.create({
      data: {
        lineUserId: pending.lineUserId,
        linePictureUrl: pending.picture ?? null,
        name,
        role: "member",
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // 競合（既に同じ lineUserId で別フローから作られた等）→ 既存ユーザーを引き当てる
      const existing = await prisma.user.findUnique({
        where: { lineUserId: pending.lineUserId },
      });
      if (!existing) {
        return { ok: false, error: "登録に失敗しました。もう一度お試しください" };
      }
      createdId = existing.id;
    } else {
      throw e;
    }
  }

  // 仮置き cookie 破棄
  const store = await cookies();
  store.delete(PENDING_COOKIE);

  // session 発行
  const session = issueSession({ userId: createdId, role: "member" });
  store.set(SESSION_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect("/");
}
