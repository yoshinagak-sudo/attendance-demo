import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { startOfTodayJST, formatJSTDateTime } from "@/lib/time";
import { buildDailyStats, generateAiSummary } from "@/lib/attendance";
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

  const [users, records] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.timeRecord.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
      include: { user: true },
    }),
  ]);

  const stats = buildDailyStats(users, records, now);
  const summaryText = generateAiSummary(stats, now);
  const dateLabel = formatDateJP(now);

  return (
    <main className="container-wide">
      <header className="header">
        <div>
          <h1 className="title">勤怠ダッシュボード</h1>
          <span className="subtitle">{dateLabel}</span>
        </div>
        <Link href="/" className="link">
          ← 打刻画面
        </Link>
      </header>

      <AiSummary text={summaryText} />

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
