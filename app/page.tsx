import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfTodayJST } from "@/lib/time";
import { PunchPanel } from "./punch-panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  const since = startOfTodayJST();

  const todayRecords = await prisma.timeRecord.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: "desc" },
    include: { user: true },
  });

  const latestByUser = new Map<string, { type: string; timestamp: Date }>();
  for (const r of todayRecords) {
    if (!latestByUser.has(r.userId)) {
      latestByUser.set(r.userId, { type: r.type, timestamp: r.timestamp });
    }
  }

  const userList = users.map((u) => ({
    id: u.id,
    name: u.name,
    latest: latestByUser.get(u.id)
      ? {
          type: latestByUser.get(u.id)!.type,
          timestamp: latestByUser.get(u.id)!.timestamp.toISOString(),
        }
      : null,
  }));

  const recent = todayRecords.slice(0, 3).map((r) => ({
    id: r.id,
    userName: r.user.name,
    type: r.type,
    timestamp: r.timestamp.toISOString(),
  }));

  const serverNow = new Date().toISOString();

  return (
    <main className="container">
      <header className="header">
        <h1 className="title">勤怠打刻</h1>
        <Link href="/admin" className="link">
          管理画面 →
        </Link>
      </header>
      <PunchPanel users={userList} recent={recent} serverNow={serverNow} />
    </main>
  );
}
