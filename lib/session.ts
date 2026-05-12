import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionNode } from "@/lib/session-node";

export type SessionUser = {
  id: string;
  name: string;
  loginId: string;
  role: "member" | "manager";
};

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
    role: (user.role === "manager" ? "manager" : "member") as "member" | "manager",
  };
}

export async function requireSession(nextPath: string = "/"): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

export async function requireManager(nextPath: string = "/admin"): Promise<SessionUser> {
  const session = await requireSession(nextPath);
  if (session.role !== "manager") {
    redirect("/");
  }
  return session;
}
