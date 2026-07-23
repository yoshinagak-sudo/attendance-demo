import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import {
  ATTENDANCE_CATEGORIES,
  CATEGORY_LABEL,
  REQUEST_TYPE_LABEL,
  STATUS_LABEL,
  formatLeaveDays,
  type AttendanceCategory,
  type AttendanceStatus,
  type RequestType,
} from "@/lib/attendance-request";
import { formatDurationJa } from "@/lib/overtime";
import { formatJSTHHmm, formatJSTYmd } from "@/lib/time";
import { AttendanceQueueRow } from "@/app/admin/attendance/queue-row";

export const dynamic = "force-dynamic";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${WEEKDAY_JA[dow]})`;
}

function statusBadgeClass(status: string): string {
  switch (status as AttendanceStatus) {
    case "submitted":
      return "badge ot-badge-submitted";
    case "approved":
      return "badge ot-badge-approved";
    case "rejected":
      return "badge ot-badge-rejected";
    case "sent_back":
      return "badge ot-badge-sent-back";
    default:
      return "badge";
  }
}

type SearchParams = Promise<{
  status?: string;
  category?: string;
  reviewed?: string;
  error?: string;
  id?: string;
}>;

export default async function DashboardAttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireDashboardSession();
  const sp = await searchParams;
  const filterStatus = sp.status === "all" ? "all" : "pending";
  const filterCategoryRaw = sp.category ?? "all";
  const filterCategory: "all" | AttendanceCategory =
    filterCategoryRaw === "all" ||
    !(ATTENDANCE_CATEGORIES as readonly string[]).includes(filterCategoryRaw)
      ? "all"
      : (filterCategoryRaw as AttendanceCategory);
  const reviewed = sp.reviewed === "1";
  const errorMsg = sp.error;

  const whereBase = {
    ...(filterStatus === "pending" ? { status: "submitted" } : {}),
    ...(filterCategory !== "all" ? { category: filterCategory } : {}),
  };

  const [pendingCount, categoryCounts, allCount, rows] = await Promise.all([
    prisma.attendanceRequest.count({ where: { status: "submitted" } }),
    Promise.all(
      ATTENDANCE_CATEGORIES.map(async (c) => ({
        c,
        count: await prisma.attendanceRequest.count({
          where: { status: "submitted", category: c },
        }),
      })),
    ),
    prisma.attendanceRequest.count(),
    prisma.attendanceRequest.findMany({
      where: whereBase,
      include: { user: true, substituteFor: true },
      orderBy:
        filterStatus === "pending"
          ? [{ workDate: "asc" }, { createdAt: "asc" }]
          : [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">勤怠申請</span>
          <h1 className="dash-page-title">勤怠申請 承認キュー</h1>
          <span className="dash-page-sub">
            残業以外の申請(欠勤・遅刻・早退・私用外出・有給・特別・振替)の承認
          </span>
        </div>
        <div className="dash-page-side">
          <Link href="/dashboard/paid-leave" className="link">
            有給付与へ
          </Link>
        </div>
      </header>

      {reviewed && (
        <div className="ot-banner ot-banner-success" role="status">
          <span className="ot-banner-icon" aria-hidden="true">✓</span>
          <div className="ot-banner-body">承認/差戻を反映しました</div>
        </div>
      )}

      {errorMsg && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">!</span>
          <div className="ot-banner-body">{errorMsg}</div>
        </div>
      )}

      <section className="section" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h2 className="section-title">概況</h2>
        </div>
        <div className="cards">
          <div className="card">
            <div className="card-head">
              <span className="card-label">未承認</span>
            </div>
            <div className="card-value">
              {pendingCount}
              <span className="card-unit">件</span>
            </div>
            <div className="card-foot">全カテゴリ合計</div>
          </div>
          {categoryCounts.map(({ c, count }) =>
            count > 0 ? (
              <div className="card" key={c}>
                <div className="card-head">
                  <span className="card-label">{CATEGORY_LABEL[c]}</span>
                </div>
                <div className="card-value">
                  {count}
                  <span className="card-unit">件</span>
                </div>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">申請一覧</h2>
          <span className="section-sub tabular">表示中 {rows.length} 件</span>
        </div>

        <div className="ot-admin-toolbar">
          <div className="ot-filter-tabs" role="tablist" aria-label="ステータス">
            <Link
              href={`/dashboard/attendance${filterCategory !== "all" ? `?category=${filterCategory}` : ""}`}
              className={filterStatus === "pending" ? "ot-filter-tab is-active" : "ot-filter-tab"}
              role="tab"
            >
              申請中のみ
              <span className="ot-filter-count">{pendingCount}</span>
            </Link>
            <Link
              href={`/dashboard/attendance?status=all${filterCategory !== "all" ? `&category=${filterCategory}` : ""}`}
              className={filterStatus === "all" ? "ot-filter-tab is-active" : "ot-filter-tab"}
              role="tab"
            >
              すべて
              <span className="ot-filter-count">{allCount}</span>
            </Link>
          </div>
        </div>

        <div className="ot-admin-toolbar" style={{ marginTop: 8 }}>
          <div className="ot-filter-tabs" role="tablist" aria-label="カテゴリ">
            <Link
              href={`/dashboard/attendance${filterStatus === "all" ? "?status=all" : ""}`}
              className={filterCategory === "all" ? "ot-filter-tab is-active" : "ot-filter-tab"}
            >
              すべて
            </Link>
            {ATTENDANCE_CATEGORIES.map((c) => (
              <Link
                key={c}
                href={`/dashboard/attendance?category=${c}${filterStatus === "all" ? "&status=all" : ""}`}
                className={filterCategory === c ? "ot-filter-tab is-active" : "ot-filter-tab"}
              >
                {CATEGORY_LABEL[c]}
                {categoryCounts.find((cc) => cc.c === c)?.count ? (
                  <span className="ot-filter-count">
                    {categoryCounts.find((cc) => cc.c === c)?.count}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="ot-empty">
            <div className="ot-empty-title">該当する申請はありません</div>
          </div>
        ) : (
          <div className="table-wrap ot-queue-scroll">
            <table className="ot-queue-table">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>対象日</th>
                  <th style={{ width: 120 }}>申請者</th>
                  <th style={{ width: 110 }}>カテゴリ</th>
                  <th style={{ width: 64 }}>種別</th>
                  <th style={{ width: 200 }}>内容</th>
                  <th>補足</th>
                  <th style={{ width: 88 }}>状態</th>
                  <th style={{ width: 1 }} aria-label="アクション" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const contents = ((): string => {
                    const cat = r.category as AttendanceCategory;
                    if (cat === "late" || cat === "early_leave") {
                      const sched = r.scheduledAt ? formatJSTHHmm(r.scheduledAt) : "—";
                      const act = r.startAt ? formatJSTHHmm(r.startAt) : "—";
                      const diff =
                        r.durationMinutes != null
                          ? `(${formatDurationJa(r.durationMinutes)})`
                          : "";
                      return `予定 ${sched} / 実 ${act} ${diff}`;
                    }
                    if (cat === "personal_out") {
                      return `${r.startAt ? formatJSTHHmm(r.startAt) : "—"} 〜 ${r.endAt ? formatJSTHHmm(r.endAt) : "—"}${
                        r.durationMinutes != null ? `(${formatDurationJa(r.durationMinutes)})` : ""
                      }`;
                    }
                    if (cat === "paid_leave") {
                      return `${formatLeaveDays(r.leaveDays)}(${r.paidLeaveKind ?? "-"})`;
                    }
                    if (cat === "substitute_leave" && r.substituteFor) {
                      return `振替:${formatJSTYmd(r.substituteFor.workDate)} 出勤 → ${formatLeaveDays(r.leaveDays)}`;
                    }
                    if (cat === "special_leave") {
                      return `${formatLeaveDays(r.leaveDays)}・理由: ${r.reason ?? "—"}`;
                    }
                    return formatLeaveDays(r.leaveDays);
                  })();
                  return (
                    <AttendanceQueueRow
                      key={r.id}
                      row={{
                        id: r.id,
                        workDateLabel: formatDate(r.workDate),
                        userName: r.user.name,
                        categoryLabel: CATEGORY_LABEL[r.category as AttendanceCategory] ?? r.category,
                        requestTypeLabel: REQUEST_TYPE_LABEL[r.requestType as RequestType] ?? "-",
                        contents,
                        description: r.description ?? "",
                        statusLabel: STATUS_LABEL[r.status as AttendanceStatus] ?? r.status,
                        statusClass: statusBadgeClass(r.status),
                        isSubmitted: r.status === "submitted",
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
