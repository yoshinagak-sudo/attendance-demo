import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { type } = body as { type?: string };

  if (type !== "IN" && type !== "OUT") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const record = await prisma.timeRecord.create({
    data: { userId: session.id, type },
  });

  return NextResponse.json({ ok: true, record });
}
