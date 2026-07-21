import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  formatLeaveDays,
  type AttendanceCategory,
  type AttendanceStatus,
  type RequestType,
} from "@/lib/attendance-request";
import { computePaidLeaveBalance } from "@/lib/paid-leave";
import { formatJSTYmd, formatJSTHHmm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatDurationJa } from "@/lib/overtime";

export const dynamic = "force-dynamic";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatHistoryDate(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日(${WEEKDAY_JA[dow]})`;
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
  withdrawn?: string;
  submitted?: string;
}>;

/** カテゴリの見出しカード。href は /attendance/new/[category] へ。 */
const REQUEST_CARDS: {
  href: string;
  label: string;
  hint: string;
  group: "work" | "leave" | "attendance";
}[] = [
  { href: "/overtime/new", label: "残業", hint: "所定終業以降の勤務", group: "work" },
  { href: "/overtime/new?category=holiday_work", label: "休日出勤", hint: "休日の出勤", group: "work" },
  { href: "/attendance/new/late", label: "遅刻", hint: "予定より遅い出勤", group: "attendance" },
  { href: "/attendance/new/early_leave", label: "早退", hint: "予定より早い退勤", group: "attendance" },
  { href: "/attendance/new/personal_out", label: "私用外出", hint: "業務中の一時外出", group: "attendance" },
  { href: "/attendance/new/absence", label: "欠勤", hint: "終日休む（連絡済み）", group: "leave" },
  { href: "/attendance/new/paid_leave", label: "年次有給休暇", hint: "全休 / 午前休 / 午後休", group: "leave" },
  { href: "/attendance/new/special_leave", label: "特別休暇", hint: "慶弔・忌引 など", group: "leave" },
  { href: "/attendance/new/substitute_leave", label: "振替休暇", hint: "休日出勤の代休", group: "leave" },
];

export default async function AttendanceIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/attendance");
  const params = await searchParams;
  const withdrawn = params.withdrawn === "1";
  const submitted = params.submitted === "1";

  const [requests, grants, cons] = await Promise.all([
    prisma.attendanceRequest.findMany({
      where: { userId: session.id },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.paidLeaveGrant.findMany({ where: { userId: session.id } }),
    prisma.attendanceRequest.findMany({
      where: {
        userId: session.id,
        category: "paid_leave",
        status: { in: ["submitted", "approved"] },
      },
      select: { id: true, workDate: true, leaveDays: true, status: true },
    }),
  ]);

  const balance = computePaidLeaveBalance(
    grants.map((g) => ({ id: g.id, grantedOn: g.grantedOn, expiresOn: g.expiresOn, days: g.days })),
    cons.map((c) => ({
      id: c.id,
      workDate: c.workDate,
      leaveDays: c.leaveDays ?? 0,
      status: c.status as "submitted" | "approved",
    })),
  );

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">申請</h1>
            <span className="subtitle">
              残業・休日出勤・休暇の申請と履歴。事前申請推奨、事後もカテゴリ別に許容
            </span>
          </div>
          <Link href="/" className="link">
            ← 打刻画面
          </Link>
        </header>

        {(withdrawn || submitted) && (
          <div className="ot-toast" role="status" aria-live="polite">
            {submitted ? "申請を提出しました" : "申請を取り消しました"}
          </div>
        )}

        <section className="section" aria-labelledby="paid-leave-summary">
          <div className="section-head">
            <h2 id="paid-leave-summary" className="section-title">
              年次有給休暇 残日数
            </h2>
            <Link href="/attendance/paid-leave" className="link">
              詳細 →
            </Link>
          </div>
          <div className="cards">
            <div className="card">
              <div className="card-head">
                <span className="card-label">残</span>
              </div>
              <div className="card-value">
                {formatLeaveDays(balance.remaining)}
              </div>
              <div className="card-foot">
                承認済 {formatLeaveDays(balance.usedApproved)} / 申請中 {formatLeaveDays(balance.usedPending)}
              </div>
            </div>
            {balance.nextExpiry && (
              <div className="card">
                <div className="card-head">
                  <span className="card-label">最短失効</span>
                </div>
                <div className="card-value">{formatLeaveDays(balance.nextExpiry.days)}</div>
                <div className="card-foot">
                  {formatJSTYmd(balance.nextExpiry.expiresOn)} 失効
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="section" aria-labelledby="attendance-new">
          <div className="section-head">
            <h2 id="attendance-new" className="section-title">
              新規申請
            </h2>
          </div>
          <div className="attendance-card-grid">
            {REQUEST_CARDS.map((c) => (
              <Link key={c.href} href={c.href} className={`attendance-card attendance-card-${c.group}`}>
                <div className="attendance-card-label">{c.label}</div>
                <div className="attendance-card-hint">{c.hint}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="attendance-history-heading">
          <div className="section-head">
            <h2 id="attendance-history-heading" className="section-title">
              自分の申請履歴（勤怠系）
            </h2>
            <span className="section-sub tabular">全 {requests.length} 件</span>
          </div>

          {requests.length === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">まだ申請がありません</div>
              <div>上のカードから新規申請してください</div>
            </div>
          ) : (
            <div className="ot-history-list">
              {requests.map((r) => (
                <Link
                  key={r.id}
                  href={`/attendance/${r.id}`}
                  className="ot-history-row"
                >
                  <div className="ot-history-main">
                    <div className="ot-history-date">
                      {formatHistoryDate(r.workDate)}
                      <span style={{ marginLeft: 8, color: "var(--muted-2)" }}>
                        {CATEGORY_LABEL[r.category as AttendanceCategory] ?? r.category} /{" "}
                        {REQUEST_TYPE_LABEL[r.requestType as RequestType] ?? "—"}
                      </span>
                    </div>
                    <div className="ot-history-detail">
                      {r.category === "paid_leave" || r.category === "absence" || r.category === "special_leave" || r.category === "substitute_leave"
                        ? formatLeaveDays(r.leaveDays)
                        : r.startAt && r.endAt
                          ? `${formatJSTHHmm(r.startAt)} 〜 ${formatJSTHHmm(r.endAt)}${r.durationMinutes != null ? `（${formatDurationJa(r.durationMinutes)}）` : ""}`
                          : "—"}
                      {r.reason ? `・${r.reason}` : ""}
                    </div>
                  </div>
                  <div className="ot-history-side">
                    <span className={statusBadgeClass(r.status)}>
                      {STATUS_LABEL[r.status as AttendanceStatus] ?? r.status}
                    </span>
                    <span className="ot-history-arrow" aria-hidden="true">
                      ›
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="ot-cta-row" style={{ marginTop: 12 }}>
          <Link href="/overtime" className="link">
            残業だけの一覧を開く →
          </Link>
        </div>
      </main>
    </>
  );
}
