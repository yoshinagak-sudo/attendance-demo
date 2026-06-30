import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import { startOfTodayJST, formatJSTYmd } from "@/lib/time";
import {
  STATUS_LABEL,
  formatMinutesJa,
  type ReportStatus,
} from "@/lib/daily-report";

export const dynamic = "force-dynamic";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatHistoryDate(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日(${WEEKDAY_JA[dow]})`;
}

function statusBadgeClass(status: string): string {
  switch (status as ReportStatus) {
    case "draft":
      return "badge dr-badge-draft";
    case "submitted":
      return "badge dr-badge-submitted";
    case "acknowledged":
      return "badge dr-badge-acknowledged";
    default:
      return "badge";
  }
}

export default async function DashboardReportPage() {
  await requireDashboardSession();
  const today = startOfTodayJST();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [todaySubmitted, awaiting, recent, users] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { reportDate: today },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dailyReport.findMany({
      where: { status: "submitted" },
      include: { user: true },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.dailyReport.findMany({
      where: { reportDate: { gte: sevenDaysAgo, lte: today } },
      include: { user: true },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">日報</span>
          <h1 className="dash-page-title">日報管理</h1>
          <span className="dash-page-sub">
            {formatJSTYmd(today)}・提出された日報の確認
          </span>
        </div>
      </header>

      {awaiting.length > 0 && (
        <div className="ot-banner ot-banner-warn">
          <span className="ot-banner-icon" aria-hidden="true">⚠</span>
          <div className="ot-banner-body">
            <strong>未確認の日報 {awaiting.length} 件</strong>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              提出後の確認待ち。下のリストから個別に確認できます
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">本日の提出状況</h2>
          <span className="section-sub tabular">
            {todaySubmitted.length} / {users.length} 名
          </span>
        </div>
        {todaySubmitted.length === 0 ? (
          <div className="ot-empty">
            <div className="ot-empty-title">本日提出された日報はまだありません</div>
          </div>
        ) : (
          <div className="dr-history-list">
            {todaySubmitted.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/report/${r.id}`}
                className="dr-history-row"
              >
                <div className="dr-history-main">
                  <div className="dr-history-date">{r.user.name}</div>
                  <div className="dr-history-detail">
                    合計 {formatMinutesJa(r.totalMinutes)}
                  </div>
                </div>
                <span className={statusBadgeClass(r.status)}>
                  {STATUS_LABEL[r.status as ReportStatus]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">直近7日の日報</h2>
          <span className="section-sub tabular">{recent.length} 件</span>
        </div>
        {recent.length === 0 ? (
          <div className="ot-empty">
            <div className="ot-empty-title">日報はまだありません</div>
          </div>
        ) : (
          <div className="dr-history-list">
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/dashboard/report/${r.id}`}
                className="dr-history-row"
              >
                <div className="dr-history-main">
                  <div className="dr-history-date">
                    {formatHistoryDate(r.reportDate)}
                    <span
                      style={{ marginLeft: 8, color: "var(--muted-2)" }}
                    >
                      {r.user.name}
                    </span>
                  </div>
                  <div className="dr-history-detail">
                    合計 {formatMinutesJa(r.totalMinutes)}
                    {r.progressNote && (
                      <span
                        style={{ color: "var(--muted)", marginLeft: 8 }}
                      >
                        ・{r.progressNote.split("\n")[0].slice(0, 30)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={statusBadgeClass(r.status)}>
                  {STATUS_LABEL[r.status as ReportStatus]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
