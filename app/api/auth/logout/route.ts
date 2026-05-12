import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session-node";

export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
