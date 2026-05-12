import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST, formatJSTYmd, formatJSTHHmm } from "@/lib/time";
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
    case "draft": return "badge dr-badge-draft";
    case "submitted": return "badge dr-badge-submitted";
    case "acknowledged": return "badge dr-badge-acknowledged";
    default: return "badge";
  }
}

type SearchParams = Promise<{
  submitted?: string;
  withdrawn?: string;
}>;

export default async function ReportIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/report");
  const sp = await searchParams;
  const today = startOfTodayJST();

  const [todayReport, history] = await Promise.all([
    prisma.dailyReport.findUnique({
      where: { userId_reportDate: { userId: session.id, reportDate: today } },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    }),
    prisma.dailyReport.findMany({
      where: { userId: session.id },
      orderBy: { reportDate: "desc" },
      take: 30,
    }),
  ]);

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">日報</h1>
            <span className="subtitle">本日の業務内容を作業ごとに記録します</span>
          </div>
          <Link href="/" className="link">← 打刻画面</Link>
        </header>

        {sp.submitted && (
          <div className="ot-toast" role="status">日報を提出しました</div>
        )}
        {sp.withdrawn && (
          <div className="ot-toast" role="status">日報を取り下げました</div>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">本日の日報</h2>
            <span className="section-sub">{formatJSTYmd(today)}</span>
          </div>
          {todayReport ? (
            <Link href={`/report/today`} className="dr-today-card card">
              <div className="dr-today-head">
                <span className={statusBadgeClass(todayReport.status)}>
                  {STATUS_LABEL[todayReport.status as ReportStatus]}
                </span>
                <span className="num dr-today-total">
                  合計 {formatMinutesJa(todayReport.totalMinutes)}
                </span>
              </div>
              <div className="dr-today-items">
                {todayReport.items.slice(0, 3).map((it) => (
                  <div key={it.id} className="dr-today-item">
                    <span className="num">{formatJSTHHmm(it.startAt)}〜{formatJSTHHmm(it.endAt)}</span>
                    <span>{it.workSiteName}・{it.description}</span>
                  </div>
                ))}
                {todayReport.items.length > 3 && (
                  <div className="dr-today-item" style={{ color: "var(--muted)" }}>
                    他 {todayReport.items.length - 3} 件
                  </div>
                )}
                {todayReport.items.length === 0 && (
                  <div className="dr-today-item" style={{ color: "var(--muted)" }}>
                    作業アイテム未入力
                  </div>
                )}
              </div>
              <div className="dr-today-cta">
                {todayReport.status === "draft"
                  ? "編集して提出する →"
                  : todayReport.status === "submitted"
                    ? "内容を確認する →"
                    : "確認済 →"}
              </div>
            </Link>
          ) : (
            <Link href="/report/today" className="ot-btn-primary ot-btn-lg ot-btn-block">
              + 本日の日報を作成
            </Link>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">過去の日報</h2>
            <span className="section-sub tabular">直近 {history.length} 件</span>
          </div>
          {history.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">日報はまだありません</div></div>
          ) : (
            <div className="dr-history-list">
              {history.map((r) => (
                <Link key={r.id} href={`/report/${r.id}`} className="dr-history-row">
                  <div className="dr-history-main">
                    <div className="dr-history-date">{formatHistoryDate(r.reportDate)}</div>
                    <div className="dr-history-detail">
                      合計 {formatMinutesJa(r.totalMinutes)}
                      {r.progressNote && (
                        <span style={{ color: "var(--muted)", marginLeft: 8 }}>
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
      </main>
    </>
  );
}
