import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/admin-auth";
import {
  formatDurationJa,
  type OvertimeStatus,
  type RequestType,
} from "@/lib/overtime";
import {
  formatJSTHHmm,
  formatJSTYmd,
  startOfTodayJST,
  startOfMonthJST,
  endOfMonthJST,
} from "@/lib/time";
import { ReviewerSelect } from "./reviewer-select";
import { QueueRows } from "./queue-rows";

export const dynamic = "force-dynamic";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatWorkDate(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}（${WEEKDAY_JA[dow]}）`;
}

type SearchParams = Promise<{
  status?: string;
  reviewed?: string;
  error?: string;
  id?: string;
}>;

export default async function AdminOvertimePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/overtime");
  }

  const sp = await searchParams;
  const filter = sp.status === "all" ? "all" : "pending";
  const reviewed = sp.reviewed === "1";
  const errorMsg = sp.error;

  // KPI 用集計
  const todayStart = startOfTodayJST();
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const now = new Date();
  const ymd = formatJSTYmd(now);
  const [y, m] = ymd.split("-").map(Number);
  const monthStart = startOfMonthJST(y, m);
  const monthEnd = endOfMonthJST(y, m);

  const [
    pendingCount,
    todayApprovedCount,
    todaySentBackCount,
    monthApprovedAgg,
    pendingRequests,
    allRequests,
    managers,
  ] = await Promise.all([
    prisma.overtimeRequest.count({ where: { status: "submitted" } }),
    prisma.overtimeRequest.count({
      where: {
        status: "approved",
        reviewedAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.overtimeRequest.count({
      where: {
        status: "sent_back",
        reviewedAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),
    prisma.overtimeRequest.aggregate({
      where: {
        status: "approved",
        workDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { durationMinutes: true },
    }),
    prisma.overtimeRequest.findMany({
      where: { status: "submitted" },
      include: { user: true, workSite: true },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.overtimeRequest.findMany({
      include: { user: true, workSite: true },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.user.findMany({
      where: { role: "manager" },
      orderBy: { name: "asc" },
    }),
  ]);

  const monthApprovedMinutes = monthApprovedAgg._sum.durationMinutes ?? 0;

  const rows = filter === "all" ? allRequests : pendingRequests;

  return (
    <main className="container-wide">
      <header className="header">
        <div>
          <h1 className="title">残業申請 承認キュー</h1>
          <span className="subtitle">事前/事後申請の承認・差戻</span>
        </div>
        <div className="ot-admin-actions">
          <Link href="/admin/overtime/report" className="link">
            月次レポート
          </Link>
          <Link href="/admin/settings/overtime" className="link">
            設定
          </Link>
          <Link href="/admin" className="link">
            ← 管理
          </Link>
        </div>
      </header>

      {reviewed && (
        <div className="ot-banner ot-banner-success" role="status">
          <span className="ot-banner-icon" aria-hidden="true">
            ✓
          </span>
          <div className="ot-banner-body">承認/差戻を反映しました</div>
        </div>
      )}

      {errorMsg && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">{errorMsg}</div>
        </div>
      )}

      {/* KPI */}
      <section
        className="section"
        aria-labelledby="ot-kpi-heading"
        style={{ marginTop: 16 }}
      >
        <div className="section-head">
          <h2 id="ot-kpi-heading" className="section-title">
            概況
          </h2>
        </div>
        <div className="cards">
          <div className="card">
            <div className="card-head">
              <span className="card-label">申請中</span>
            </div>
            <div className="card-value">
              {pendingCount}
              <span className="card-unit">件</span>
            </div>
            <div className="card-foot">承認/差戻 待ち</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">本日承認</span>
            </div>
            <div className="card-value">
              {todayApprovedCount}
              <span className="card-unit">件</span>
            </div>
            <div className="card-foot">本日中の承認件数</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">本日差戻</span>
            </div>
            <div className="card-value">
              {todaySentBackCount}
              <span className="card-unit">件</span>
            </div>
            <div className="card-foot">本日中の差戻件数</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">月次承認分</span>
            </div>
            <div className="card-value">
              {formatDurationJa(monthApprovedMinutes)}
            </div>
            <div className="card-foot">{m}月の承認済 残業合計</div>
          </div>
        </div>
      </section>

      {/* ツールバー: 承認者選択 + フィルタ */}
      <section className="section" aria-labelledby="ot-toolbar-heading">
        <div className="section-head">
          <h2 id="ot-toolbar-heading" className="section-title">
            申請一覧
          </h2>
          <span className="section-sub tabular">
            表示中 {rows.length} 件
            {filter === "pending" ? "（申請中のみ）" : "（すべて）"}
          </span>
        </div>

        <div className="ot-admin-toolbar">
          <ReviewerSelect
            managers={managers.map((u) => ({ id: u.id, name: u.name }))}
          />

          <div className="ot-toolbar-spacer" />

          <div className="ot-filter-tabs" role="tablist" aria-label="ステータスフィルタ">
            <Link
              href="/admin/overtime"
              className={
                filter === "pending" ? "ot-filter-tab is-active" : "ot-filter-tab"
              }
              role="tab"
              aria-selected={filter === "pending"}
            >
              申請中のみ
              <span className="ot-filter-count">{pendingCount}</span>
            </Link>
            <Link
              href="/admin/overtime?status=all"
              className={
                filter === "all" ? "ot-filter-tab is-active" : "ot-filter-tab"
              }
              role="tab"
              aria-selected={filter === "all"}
            >
              すべて
              <span className="ot-filter-count">{allRequests.length}</span>
            </Link>
          </div>
        </div>

        {managers.length === 0 && (
          <div className="ot-banner ot-banner-warn" role="status">
            <span className="ot-banner-icon" aria-hidden="true">
              !
            </span>
            <div className="ot-banner-body">
              <div style={{ fontWeight: 700 }}>
                承認者ロールのユーザーが登録されていません
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                User.role を <code>manager</code> に変更すると承認者として選択できます
              </div>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="ot-empty">
            <div className="ot-empty-title">
              {filter === "pending"
                ? "申請中の残業はありません"
                : "申請がありません"}
            </div>
            <div>
              {filter === "pending"
                ? "新規の申請が届くとここに表示されます"
                : "申請者から残業申請が届くとここに表示されます"}
            </div>
          </div>
        ) : (
          <div className="table-wrap ot-queue-scroll">
            <table className="ot-queue-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>業務日</th>
                  <th style={{ width: 120 }}>申請者</th>
                  <th style={{ width: 64 }}>種別</th>
                  <th style={{ width: 140 }}>時間帯</th>
                  <th style={{ width: 80 }}>残業</th>
                  <th>現場</th>
                  <th>作業内容</th>
                  <th style={{ width: 88 }}>状態</th>
                  <th style={{ width: 1 }} aria-label="アクション" />
                </tr>
              </thead>
              <tbody>
                <QueueRows
                  rows={rows.map((r) => ({
                    id: r.id,
                    workDateLabel: formatWorkDate(r.workDate),
                    userName: r.user.name,
                    requestType: r.requestType as RequestType,
                    timeRange: `${formatJSTHHmm(r.startAt)}〜${formatJSTHHmm(r.endAt)}`,
                    durationLabel: formatDurationJa(r.durationMinutes),
                    workSiteName: r.workSiteName,
                    description: r.description,
                    status: r.status as OvertimeStatus,
                  }))}
                />
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
