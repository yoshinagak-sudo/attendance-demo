import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfMonthJST, endOfMonthJST } from "@/lib/time";
import {
  buildMonthlyVehicleRows,
  buildMonthlyUserDrivingRows,
  formatDistanceKm,
  formatLiters,
  formatJpy,
} from "@/lib/vehicle";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ym?: string }>;

function parseYm(ym: string | undefined): { year: number; month: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    return { year: y, month: m };
  }
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}

function ymLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftYm(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export default async function AdminVehicleReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireManager("/admin/vehicle/report");
  const sp = await searchParams;
  const { year, month } = parseYm(sp.ym);
  const monthStart = startOfMonthJST(year, month);
  const monthEnd = endOfMonthJST(year, month);

  const [vehicles, drivingLogs, refuelingLogs, users] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ plate: "asc" }] }),
    prisma.drivingLog.findMany({
      where: { workDate: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.refuelingLog.findMany({
      where: { refuelDate: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.user.findMany({ where: { isActive: true } }),
  ]);

  const vehicleRows = buildMonthlyVehicleRows({ vehicles, drivingLogs, refuelingLogs });
  const userRows = buildMonthlyUserDrivingRows({ users, drivingLogs });

  const prev = shiftYm(year, month, -1);
  const next = shiftYm(year, month, +1);

  const totals = {
    distanceKm: vehicleRows.reduce((a, r) => a + r.totalDistanceKm, 0),
    liters: Math.round(vehicleRows.reduce((a, r) => a + r.totalRefuelLiters, 0) * 10) / 10,
    jpy: vehicleRows.reduce((a, r) => a + r.totalRefuelJpy, 0),
    count: vehicleRows.reduce((a, r) => a + r.drivingCount, 0),
  };

  const ymStr = ymString(year, month);

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両 月次レポート</h1>
            <span className="subtitle">{ymLabel(year, month)}</span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/admin/vehicle" className="link">← 一覧</Link>
          </div>
        </header>

        <div className="ot-month-nav">
          <Link href={`/admin/vehicle/report?ym=${ymString(prev.year, prev.month)}`} className="link">
            ← {ymLabel(prev.year, prev.month)}
          </Link>
          <strong>{ymLabel(year, month)}</strong>
          <Link href={`/admin/vehicle/report?ym=${ymString(next.year, next.month)}`} className="link">
            {ymLabel(next.year, next.month)} →
          </Link>
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">月次サマリ</h2>
          </div>
          <div className="vh-kpi-grid">
            <div className="vh-kpi-card">
              <div className="vh-kpi-label">総走行距離</div>
              <div className="vh-kpi-value num">{formatDistanceKm(totals.distanceKm)}</div>
            </div>
            <div className="vh-kpi-card">
              <div className="vh-kpi-label">走行回数</div>
              <div className="vh-kpi-value num">{totals.count} 回</div>
            </div>
            <div className="vh-kpi-card">
              <div className="vh-kpi-label">給油量</div>
              <div className="vh-kpi-value num">{formatLiters(totals.liters)}</div>
            </div>
            <div className="vh-kpi-card">
              <div className="vh-kpi-label">給油代</div>
              <div className="vh-kpi-value num">{formatJpy(totals.jpy)}</div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">車両別</h2>
            <a
              href={`/api/admin/vehicle/driving?ym=${ymStr}`}
              className="link"
            >走行CSV</a>
          </div>
          {vehicleRows.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">データがありません</div></div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>車両</th>
                    <th style={{ textAlign: "right" }}>走行距離</th>
                    <th style={{ textAlign: "right" }}>走行回数</th>
                    <th style={{ textAlign: "right" }}>給油量</th>
                    <th style={{ textAlign: "right" }}>給油代</th>
                    <th style={{ textAlign: "right" }}>燃費</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleRows.map((r) => (
                    <tr key={r.vehicleId}>
                      <td>
                        <strong>{r.plate}</strong>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.model}</div>
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>{formatDistanceKm(r.totalDistanceKm)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.drivingCount}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatLiters(r.totalRefuelLiters)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatJpy(r.totalRefuelJpy)}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.kmPerLiter !== null ? `${r.kmPerLiter} km/L` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">運転者別</h2>
            <a
              href={`/api/admin/vehicle/refueling?ym=${ymStr}`}
              className="link"
            >給油CSV</a>
          </div>
          {userRows.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">データがありません</div></div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>運転者</th>
                    <th style={{ textAlign: "right" }}>走行距離</th>
                    <th style={{ textAlign: "right" }}>走行回数</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.userName}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatDistanceKm(r.totalDistanceKm)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.drivingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
