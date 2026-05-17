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

  const [vehicles, sites] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: [{ plate: "asc" }],
    }),
    prisma.workSite.findMany({
      where: { isActive: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    }),
  ]);

  // 各車両の前回帰着メーター（出発時の初期値候補）
  const lastLogs = await prisma.drivingLog.findMany({
    where: { status: "completed", vehicleId: { in: vehicles.map((v) => v.id) } },
    orderBy: { endAt: "desc" },
    take: 50,
  });
  const lastOdoByVehicle: Record<string, number> = {};
  for (const log of lastLogs) {
    if (lastOdoByVehicle[log.vehicleId] === undefined && log.endOdometer !== null) {
      lastOdoByVehicle[log.vehicleId] = log.endOdometer;
    }
  }

  const preselectedVehicleId = sp.vehicleId && vehicles.some((v) => v.id === sp.vehicleId)
    ? sp.vehicleId
    : null;

  if (vehicles.length === 0) {
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
            <div className="ot-banner-body">利用可能な車両が登録されていません</div>
          </div>
        </main>
      </>
    );
  }

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

        <StartDrivingForm
          vehicles={vehicles.map((v) => ({
            id: v.id,
            plate: v.plate,
            model: v.model,
            lastOdometer: lastOdoByVehicle[v.id] ?? null,
          }))}
          preselectedVehicleId={preselectedVehicleId}
          sites={sites.map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </>
  );
}
