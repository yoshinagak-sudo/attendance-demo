import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfTodayJST, formatJSTDateTime } from "@/lib/time";
import { buildDailyStats, generateAiSummary } from "@/lib/attendance";
import { formatDurationJa } from "@/lib/overtime";
import { SummaryCards } from "./summary-cards";
import { GanttChart } from "./gantt-chart";
import { AiSummary } from "./ai-summary";

export const dynamic = "force-dynamic";

function formatDateJP(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export default async function AdminPage() {
  const now = new Date();
  const since = startOfTodayJST();

  const [users, records, pendingOvertime] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.timeRecord.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
      include: { user: true },
    }),
    prisma.overtimeRequest.findMany({
      where: { status: "submitted" },
      select: { id: true, durationMinutes: true },
    }),
  ]);

  const stats = buildDailyStats(users, records, now);
  const summaryText = generateAiSummary(stats, now);
  const dateLabel = formatDateJP(now);
  const pendingCount = pendingOvertime.length;
  const pendingMinutes = pendingOvertime.reduce((s, r) => s + r.durationMinutes, 0);

  return (
    <main className="container-wide">
      <header className="header">
        <div>
          <h1 className="title">勤怠ダッシュボード</h1>
          <span className="subtitle">{dateLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/overtime" className="link">残業申請</Link>
          <Link href="/admin/overtime" className="link">承認キュー</Link>
          <Link href="/" className="link">← 打刻画面</Link>
        </div>
      </header>

      <AiSummary text={summaryText} />

      {pendingCount > 0 && (
        <Link
          href="/admin/overtime"
          className="ot-banner ot-banner-warn"
          style={{ textDecoration: "none", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
            <span className="ot-banner-icon">!</span>
            <div className="ot-banner-body">
              <strong style={{ fontWeight: 700 }}>未承認の残業申請が {pendingCount} 件あります</strong>
              <span style={{ marginLeft: 8, fontWeight: 500 }}>
                合計 {formatDurationJa(pendingMinutes)}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>承認画面へ →</span>
        </Link>
      )}

      <SummaryCards stats={stats} />

      <section className="section" aria-labelledby="timeline-heading">
        <div className="section-head">
          <h2 id="timeline-heading" className="section-title">
            タイムライン（本日）
          </h2>
          <span className="section-sub">6:00 – 22:00 / 1時間刻み</span>
        </div>
        <GanttChart
          sessions={stats.sessions}
          userOrder={users.map((u) => ({ id: u.id, name: u.name }))}
          now={now}
        />
      </section>

      <section className="section" aria-labelledby="records-heading">
        <div className="section-head">
          <h2 id="records-heading" className="section-title">
            打刻履歴（生データ）
          </h2>
          <span className="section-sub tabular">合計 {records.length} 件</span>
        </div>
        {records.length === 0 ? (
          <p className="empty">本日の打刻はまだありません</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>時刻</th>
                  <th style={{ width: "50%" }}>従業員</th>
                  <th style={{ width: "20%" }}>区分</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{formatJSTDateTime(r.timestamp)}</td>
                    <td>{r.user.name}</td>
                    <td>
                      <span
                        className={
                          r.type === "IN" ? "badge badge-in" : "badge badge-out"
                        }
                      >
                        {r.type === "IN" ? "出勤" : "退勤"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
