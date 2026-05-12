import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfTodayJST } from "@/lib/time";
import { getSession } from "@/lib/session";
import { AppHeader } from "./_components/AppHeader";
import { PunchPanel } from "./punch-panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const since = startOfTodayJST();
  const records = await prisma.timeRecord.findMany({
    where: { userId: session.id, timestamp: { gte: since } },
    orderBy: { timestamp: "desc" },
  });

  const todayRecords = records.map((r) => ({
    id: r.id,
    type: r.type as "IN" | "OUT",
    timestamp: r.timestamp.toISOString(),
  }));

  const latestType = (records[0]?.type as "IN" | "OUT" | undefined) ?? null;
  const latestAt = records[0]?.timestamp.toISOString() ?? null;
  const serverNow = new Date().toISOString();

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <PunchPanel
          userName={session.name}
          latestType={latestType}
          latestAt={latestAt}
          todayRecords={todayRecords}
          serverNow={serverNow}
        />
      </main>
    </>
  );
}
