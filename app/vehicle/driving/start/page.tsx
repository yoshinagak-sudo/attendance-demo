import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST, formatJSTYmd } from "@/lib/time";
import { StartDrivingForm } from "./form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ vehicleId?: string }>;

export default async function StartDrivingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/vehicle/driving/start");
  const sp = await searchParams;
  const today = startOfTodayJST();

  const myAssignment = await prisma.vehicleAssignment.findFirst({
    where: { userId: session.id, releasedAt: null, assignDate: today },
    include: { vehicle: true },
  });

  const sites = await prisma.workSite.findMany({
    where: { isActive: true },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });

  const lastLog = myAssignment
    ? await prisma.drivingLog.findFirst({
        where: { vehicleId: myAssignment.vehicleId, status: "completed" },
        orderBy: { endAt: "desc" },
      })
    : null;

  if (!myAssignment) {
    return (
      <>
        <AppHeader user={session} />
        <main className="container">
          <header className="header">
            <div>
              <h1 className="title">出発登録</h1>
              <span className="subtitle">{formatJSTYmd(today)}</span>
            </div>
            <Link href="/vehicle" className="link">← 戻る</Link>
          </header>
          <div className="ot-banner ot-banner-warn">
            <div className="ot-banner-body">先に「車両管理」から車両を割り当ててください</div>
          </div>
        </main>
      </>
    );
  }

  const initialOdometer = lastLog?.endOdometer ?? null;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">出発登録</h1>
            <span className="subtitle">
              {myAssignment.vehicle.plate} ・ {myAssignment.vehicle.model}
            </span>
          </div>
          <Link href="/vehicle" className="link">← 戻る</Link>
        </header>

        <StartDrivingForm
          vehicleId={myAssignment.vehicleId}
          sites={sites.map((s) => ({ id: s.id, name: s.name }))}
          initialOdometer={initialOdometer}
        />
      </main>
    </>
  );
}
