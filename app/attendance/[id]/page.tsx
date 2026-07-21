import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, isAdminRole } from "@/lib/session";
import {
  CATEGORY_LABEL,
  REQUEST_TYPE_LABEL,
  STATUS_LABEL,
  PAID_LEAVE_KIND_LABEL,
  formatLeaveDays,
  type AttendanceCategory,
  type AttendanceStatus,
  type PaidLeaveKind,
  type RequestType,
} from "@/lib/attendance-request";
import { formatDurationJa } from "@/lib/overtime";
import { formatJSTHHmm, formatJSTYmd, formatJSTYmdHm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { withdrawAttendanceRequest } from "../actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ submitted?: string }>;

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

export default async function AttendanceDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const submitted = sp.submitted === "1";

  const session = await requireSession(`/attendance/${id}`);

  const target = await prisma.attendanceRequest.findUnique({
    where: { id },
    include: {
      user: true,
      reviewer: true,
      parent: true,
      substituteFor: true,
    },
  });
  if (!target) notFound();

  const isOwner = target.userId === session.id;
  const isManager = isAdminRole(session.role);
  if (!isOwner && !isManager) notFound();

  const status = target.status as AttendanceStatus;
  const category = target.category as AttendanceCategory;
  const reqType = target.requestType as RequestType;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">{CATEGORY_LABEL[category]} 詳細</h1>
            <span className="subtitle">
              {STATUS_LABEL[status]}・{REQUEST_TYPE_LABEL[reqType]}申請
              {!isOwner && isManager && (
                <span style={{ marginLeft: 8, color: "var(--muted-2)" }}>
                  申請者: {target.user.name}
                </span>
              )}
            </span>
          </div>
          <Link href="/attendance" className="link">
            ← 一覧
          </Link>
        </header>

        {submitted && (
          <div className="ot-toast" role="status">
            申請を提出しました
          </div>
        )}

        <div className="ot-detail-card card">
          <div className="ot-detail-row">
            <span className="ot-detail-label">対象日</span>
            <span className="num">{formatJSTYmd(target.workDate)}</span>
          </div>

          {(category === "late" || category === "early_leave") && (
            <>
              <div className="ot-detail-row">
                <span className="ot-detail-label">
                  予定{category === "late" ? "出勤" : "退勤"}時刻
                </span>
                <span className="num">
                  {target.scheduledAt ? formatJSTHHmm(target.scheduledAt) : "—"}
                </span>
              </div>
              <div className="ot-detail-row">
                <span className="ot-detail-label">
                  実{category === "late" ? "出勤" : "退勤"}時刻
                </span>
                <span className="num">
                  {target.startAt ? formatJSTHHmm(target.startAt) : "—"}
                </span>
              </div>
              <div className="ot-detail-row">
                <span className="ot-detail-label">差分</span>
                <span className="num">
                  {target.durationMinutes != null
                    ? formatDurationJa(target.durationMinutes)
                    : "—"}
                </span>
              </div>
            </>
          )}

          {category === "personal_out" && (
            <>
              <div className="ot-detail-row">
                <span className="ot-detail-label">開始</span>
                <span className="num">
                  {target.startAt ? formatJSTHHmm(target.startAt) : "—"}
                </span>
              </div>
              <div className="ot-detail-row">
                <span className="ot-detail-label">終了</span>
                <span className="num">
                  {target.endAt ? formatJSTHHmm(target.endAt) : "—"}
                </span>
              </div>
              <div className="ot-detail-row">
                <span className="ot-detail-label">時間</span>
                <span className="num">
                  {target.durationMinutes != null
                    ? formatDurationJa(target.durationMinutes)
                    : "—"}
                </span>
              </div>
            </>
          )}

          {(category === "absence" || category === "paid_leave" || category === "special_leave" || category === "substitute_leave") && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">日数</span>
              <span className="num">{formatLeaveDays(target.leaveDays)}</span>
            </div>
          )}

          {category === "paid_leave" && target.paidLeaveKind && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">種別</span>
              <span>{PAID_LEAVE_KIND_LABEL[target.paidLeaveKind as PaidLeaveKind]}</span>
            </div>
          )}

          {category === "special_leave" && target.reason && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">理由</span>
              <span>{target.reason}</span>
            </div>
          )}

          {category === "substitute_leave" && target.substituteFor && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">元の休日出勤</span>
              <span>
                {formatJSTYmd(target.substituteFor.workDate)} / {target.substituteFor.workSiteName}
              </span>
            </div>
          )}

          {target.description && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">補足</span>
              <span style={{ whiteSpace: "pre-wrap" }}>{target.description}</span>
            </div>
          )}

          <div className="ot-detail-row">
            <span className="ot-detail-label">提出日時</span>
            <span className="num">{formatJSTYmdHm(target.createdAt)}</span>
          </div>

          {target.reviewedAt && (
            <>
              <div className="ot-detail-row">
                <span className="ot-detail-label">承認・差戻</span>
                <span>
                  {target.reviewer?.name ?? "—"}・
                  <span className="num">{formatJSTYmdHm(target.reviewedAt)}</span>
                </span>
              </div>
              {target.reviewComment && (
                <div className="ot-detail-row">
                  <span className="ot-detail-label">コメント</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{target.reviewComment}</span>
                </div>
              )}
            </>
          )}
        </div>

        {isOwner && status === "submitted" && (
          <form action={withdrawAttendanceRequest} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={target.id} />
            <button type="submit" className="link" style={{ color: "var(--warn)" }}>
              この申請を取り消す
            </button>
          </form>
        )}

        {isOwner && status === "sent_back" && (
          <div className="ot-cta-row" style={{ marginTop: 16 }}>
            <Link
              href={`/attendance/new/${category}?parentId=${target.id}`}
              className="ot-btn-primary ot-btn-lg ot-btn-block"
            >
              修正して再申請する →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
