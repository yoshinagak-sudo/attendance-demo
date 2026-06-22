import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySessionNode,
  type SessionRole,
} from "@/lib/session-node";

export type SessionUser = {
  id: string;
  name: string;
  loginId: string;
  role: SessionRole;
};

export function normalizeRole(raw: string): SessionRole {
  if (raw === "developer") return "developer";
  if (raw === "manager") return "manager";
  return "member";
}

// 管理画面に入れる権限（manager + developer）
// 引数は DB から取った生の文字列でも受け取れるよう string で受ける。
export function isAdminRole(role: string): boolean {
  return role === "manager" || role === "developer";
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;
  const payload = verifySessionNode(cookie);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || !user.isActive || !user.loginId) return null;
  if (user.passwordUpdatedAt && new Date(payload.iat * 1000) < user.passwordUpdatedAt) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    loginId: user.loginId,
    role: normalizeRole(user.role),
  };
}

export async function requireSession(nextPath: string = "/"): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

// 管理画面ガード: manager と developer を通す
export async function requireManager(nextPath: string = "/admin"): Promise<SessionUser> {
  const session = await requireSession(nextPath);
  if (!isAdminRole(session.role)) {
    redirect("/");
  }
  return session;
}
