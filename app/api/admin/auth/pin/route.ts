import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  checkPin,
  isAdminPinRequired,
  issueToken,
  rateLimit,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "anonymous";

  if (!rateLimit(`pin:${ip}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let pin = "";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    pin = String(body?.pin ?? "");
  } else {
    const form = await req.formData();
    pin = String(form.get("pin") ?? "");
  }

  if (!isAdminPinRequired()) {
    const { token, maxAge } = issueToken();
    const store = await cookies();
    store.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return NextResponse.json({ ok: true, demoMode: true });
  }

  if (!checkPin(pin)) {
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 });
  }

  const { token, maxAge } = issueToken();
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
