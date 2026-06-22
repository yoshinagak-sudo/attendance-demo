import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyDummy, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  issueSession,
} from "@/lib/session-node";

const MIN_LATENCY_MS = 200;
const RATE_LIMIT = Number(process.env.LOGIN_RATE_LIMIT_PER_15MIN) || 8;
const RATE_WINDOW_MIN = 15;

async function sleepUntil(startMs: number) {
  const elapsed = Date.now() - startMs;
  const remain = MIN_LATENCY_MS - elapsed;
  if (remain > 0) await new Promise((r) => setTimeout(r, remain));
}

export async function POST(req: Request) {
  const startMs = Date.now();

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "anonymous";
  const userAgent = headerList.get("user-agent") || "";

  let body: { loginId?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const loginId = (body.loginId ?? "").trim();
  const password = body.password ?? "";

  if (!loginId || !password) {
    await sleepUntil(startMs);
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const windowStart = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      loginId,
      success: false,
      createdAt: { gte: windowStart },
    },
  });
  if (recentFailures >= RATE_LIMIT) {
    await sleepUntil(startMs);
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { loginId } });

  if (!user || !user.isActive || !user.passwordHash) {
    verifyDummy(password);
    await prisma.loginAttempt.create({
      data: { loginId, success: false, ip, userAgent },
    });
    await sleepUntil(startMs);
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const ok = verifyPassword(user.passwordHash, password);
  if (!ok) {
    await prisma.loginAttempt.create({
      data: { loginId, userId: user.id, success: false, ip, userAgent },
    });
    await sleepUntil(startMs);
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  await prisma.loginAttempt.create({
    data: { loginId, userId: user.id, success: true, ip, userAgent },
  });
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

  await sleepUntil(startMs);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, role },
  });
}
