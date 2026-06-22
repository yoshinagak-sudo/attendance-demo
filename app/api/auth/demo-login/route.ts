import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

export async function POST(req: Request) {
  if (!isDemoMode()) {
    return NextResponse.json({ ok: false, error: "demo_mode_disabled" }, { status: 403 });
  }

  let body: { loginId?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const loginId = (body.loginId ?? "").trim();
  if (!loginId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { loginId } });
  if (!user || !user.isActive) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const role: "member" | "manager" | "developer" =
    user.role === "developer"
      ? "developer"
      : user.role === "manager"
        ? "manager"
        : "member";
  const session = issueSession({ userId: user.id, role });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, session.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, role },
  });
}
