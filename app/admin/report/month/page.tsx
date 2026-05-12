import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfMonthJST, endOfMonthJST } from "@/lib/time";
import {
  buildMonthlyByUser,
  buildMonthlyBySite,
  formatMinutesJa,
} from "@/lib/daily-report";

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

export default async function AdminReportMonthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireManager("/admin/report/month");
  const sp = await searchParams;
  const { year, month } = parseYm(sp.ym);
  const monthStart = startOfMonthJST(year, month);
  const monthEnd = endOfMonthJST(year, month);

  const [reports, items, users] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { reportDate: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.dailyReportItem.findMany({
      where: { report: { reportDate: { gte: monthStart, lt: monthEnd } } },
    }),
    prisma.user.findMany({ where: { isActive: true } }),
  ]);

  const userRows = buildMonthlyByUser({ users, reports });
  const siteRows = buildMonthlyBySite({ items });

  const prev = shiftYm(year, month, -1);
  const next = shiftYm(year, month, +1);

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">日報 月次サマリ</h1>
            <span className="subtitle">{ymLabel(year, month)}</span>
          </div>
          <div className="ot-admin-actions">
            <a
              href={`/api/admin/report/items?ym=${ymString(year, month)}`}
              className="link"
            >作業明細CSV</a>
            <Link href="/admin/report" className="link">← 戻る</Link>
          </div>
        </header>

        <div className="ot-month-nav">
          <Link href={`/admin/report/month?ym=${ymString(prev.year, prev.month)}`} className="link">
            ← {ymLabel(prev.year, prev.month)}
          </Link>
          <strong>{ymLabel(year, month)}</strong>
          <Link href={`/admin/report/month?ym=${ymString(next.year, next.month)}`} className="link">
            {ymLabel(next.year, next.month)} →
          </Link>
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">社員別</h2>
            <span className="section-sub tabular">{userRows.length} 名</span>
          </div>
          {userRows.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">データがありません</div></div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>社員</th>
                    <th style={{ textAlign: "right" }}>合計工数</th>
                    <th style={{ textAlign: "right" }}>日報日数</th>
                    <th style={{ textAlign: "right" }}>提出済</th>
                    <th style={{ textAlign: "right" }}>確認済</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((r) => (
                    <tr key={r.userId}>
                      <td>{r.userName}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatMinutesJa(r.totalMinutes)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.reportedDays}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.submittedDays}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.acknowledgedDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">現場別</h2>
            <span className="section-sub tabular">{siteRows.length} 件</span>
          </div>
          {siteRows.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">データがありません</div></div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>現場名</th>
                    <th style={{ textAlign: "right" }}>合計工数</th>
                    <th style={{ textAlign: "right" }}>日報件数</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((r) => (
                    <tr key={r.workSiteName}>
                      <td>{r.workSiteName}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatMinutesJa(r.totalMinutes)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.reportCount}</td>
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
