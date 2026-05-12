import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatJSTHHmm, formatJSTYmd } from "@/lib/time";
import {
  DRIVING_STATUS_LABEL,
  formatDistanceKm,
  formatLiters,
  formatJpy,
  type DrivingStatus,
} from "@/lib/vehicle";

export const dynamic = "force-dynamic";

export default async function VehicleHistoryPage() {
  const session = await requireSession("/vehicle/history");
  const [drivingLogs, refuelingLogs] = await Promise.all([
    prisma.drivingLog.findMany({
      where: { userId: session.id },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: { vehicle: true },
    }),
    prisma.refuelingLog.findMany({
      where: { userId: session.id },
      orderBy: { refuelDate: "desc" },
      take: 20,
      include: { vehicle: true },
    }),
  ]);

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両履歴</h1>
            <span className="subtitle">自分の走行・給油記録</span>
          </div>
          <Link href="/vehicle" className="link">← 戻る</Link>
        </header>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">走行記録</h2>
            <span className="section-sub tabular">直近 {drivingLogs.length} 件</span>
          </div>
          {drivingLogs.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">走行記録はまだありません</div></div>
          ) : (
            <div className="vh-history-list">
              {drivingLogs.map((d) => (
                <Link key={d.id} href={`/vehicle/driving/${d.id}`} className="vh-history-row">
                  <div className="vh-history-main">
                    <div className="vh-history-top">
                      <span className="vh-plate-small">{d.vehicle.plate}</span>
                      <span className="vh-history-purpose">{d.purpose}</span>
                    </div>
                    <div className="vh-history-detail">{d.workSiteName}</div>
                    <div className="vh-history-time">
                      {formatJSTYmd(d.workDate)}・{formatJSTHHmm(d.startAt)}〜
                      {d.endAt ? formatJSTHHmm(d.endAt) : "—"}・
                      {formatDistanceKm(d.distanceKm)}
                    </div>
                  </div>
                  <span className={`badge vh-badge-${d.status as DrivingStatus}`}>
                    {DRIVING_STATUS_LABEL[d.status as DrivingStatus]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">給油記録</h2>
            <span className="section-sub tabular">直近 {refuelingLogs.length} 件</span>
          </div>
          {refuelingLogs.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">給油記録はまだありません</div></div>
          ) : (
            <div className="vh-refuel-list">
              {refuelingLogs.map((r) => (
                <div key={r.id} className="vh-refuel-row">
                  <div className="vh-refuel-main">
                    <span className="vh-plate-small">{r.vehicle.plate}</span>
                    <span>{r.stationName}</span>
                  </div>
                  <div className="vh-refuel-sub">
                    {formatJSTYmd(r.refuelDate)}・{formatLiters(r.liters)}・{formatJpy(r.amountJpy)}
                    {r.note ? `・${r.note}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
