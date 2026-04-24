import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, type } = body as { userId?: string; type?: string };

  if (!userId || (type !== "IN" && type !== "OUT")) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const record = await prisma.timeRecord.create({
    data: { userId, type },
  });

  return NextResponse.json({ ok: true, record });
}
