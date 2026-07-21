import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { startOfTodayJST, formatJSTDateTime } from "@/lib/time";
import { buildDailyStats, generateAiSummary } from "@/lib/attendance";
import { formatDurationJa } from "@/lib/overtime";
import { allVehicleAlertsWithin } from "@/lib/vehicle";
import { AppHeader } from "@/app/_components/AppHeader";
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
  noStore();
  const session = await requireManager("/admin");
  const now = new Date();
  const since = startOfTodayJST();

  const [users, records, pendingOvertime, inProgressDriving, pendingReports, vehicles, pendingAttendance] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.timeRecord.findMany({
        where: { timestamp: { gte: since } },
        orderBy: { timestamp: "desc" },
        include: { user: true },
      }),
      prisma.overtimeRequest.findMany({
        where: { status: "submitted", category: "overtime" },
        select: { id: true, durationMinutes: true },
      }),
      prisma.drivingLog.count({ where: { status: "in_progress" } }),
      prisma.dailyReport.count({ where: { status: "submitted" } }),
      prisma.vehicle.findMany({ where: { isActive: true } }),
      prisma.attendanceRequest.count({ where: { status: "submitted" } }),
    ]);

  const stats = buildDailyStats(users, records, now);
  const summaryText = generateAiSummary(stats, now);
  const dateLabel = formatDateJP(now);
  const pendingCount = pendingOvertime.length;
  const pendingMinutes = pendingOvertime.reduce((s, r) => s + r.durationMinutes, 0);
  const pendingAttendanceCount = pendingAttendance;
  const vehicleAlerts = allVehicleAlertsWithin({ vehicles, now });
  const inspectionWarnCount = vehicleAlerts.filter((a) => a.kind === "inspection").length;
  const vehicleInspectionWarnCount = vehicleAlerts.filter((a) => a.kind === "vehicleInspection").length;

  return (
    <>
      <AppHeader user={session} />
      <main className="container-wide">
        <header className="header">
          <div>
            <h1 className="title">勤怠ダッシュボード</h1>
            <span className="subtitle">{dateLabel}</span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/admin/overtime" className="link">残業承認</Link>
            <Link href="/admin/attendance" className="link">勤怠申請</Link>
            <Link href="/admin/paid-leave" className="link">有給付与</Link>
            <Link href="/admin/vehicle" className="link">車両管理</Link>
            <Link href="/admin/report" className="link">日報</Link>
            <Link href="/admin/users" className="link">ユーザー管理</Link>
            <Link href="/admin/settings/overtime" className="link">設定</Link>
          </div>
        </header>

      <AiSummary text={summaryText} />

      {pendingCount > 0 && (
        <Link
          href="/admin/overtime"
          className="ot-banner ot-banner-warn ot-banner-pending"
        >
          <div className="ot-banner-pending-head">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-pending-body">
              <span className="ot-banner-pending-title">
                未承認の残業申請が {pendingCount} 件あります
              </span>
              <span className="ot-banner-pending-sub">
                合計 {formatDurationJa(pendingMinutes)}
              </span>
            </div>
          </div>
          <span className="ot-banner-pending-cta">承認画面へ →</span>
        </Link>
      )}

      {pendingAttendanceCount > 0 && (
        <Link
          href="/admin/attendance"
          className="ot-banner ot-banner-warn ot-banner-pending"
        >
          <div className="ot-banner-pending-head">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-pending-body">
              <span className="ot-banner-pending-title">
                未承認の勤怠申請が {pendingAttendanceCount} 件あります
              </span>
              <span className="ot-banner-pending-sub">
                欠勤 / 遅刻 / 早退 / 私用外出 / 有給 / 特別 / 振替
              </span>
            </div>
          </div>
          <span className="ot-banner-pending-cta">承認画面へ →</span>
        </Link>
      )}

      <div className="admin-quick-cards">
        <Link href="/admin/vehicle" className="admin-quick-card">
          <div className="admin-quick-card-title">車両管理</div>
          <div className="admin-quick-card-body">
            <span className="num">{inProgressDriving}</span> 件 進行中
            {vehicleInspectionWarnCount > 0 && (
              <span className="admin-quick-card-warn">・車検警告 {vehicleInspectionWarnCount} 台</span>
            )}
            {inspectionWarnCount > 0 && (
              <span className="admin-quick-card-warn">・点検警告 {inspectionWarnCount} 台</span>
            )}
          </div>
        </Link>
        <Link href="/admin/report" className="admin-quick-card">
          <div className="admin-quick-card-title">日報</div>
          <div className="admin-quick-card-body">
            <span className="num">{pendingReports}</span> 件 未確認
          </div>
        </Link>
      </div>

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
          <div className="table-wrap is-scrollable">
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
    </>
  );
}
