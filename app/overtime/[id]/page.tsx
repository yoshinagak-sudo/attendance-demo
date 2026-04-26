import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  formatDurationJa,
  type OvertimeStatus,
  type RequestType,
} from "@/lib/overtime";
import {
  formatJSTDateWithWeekday,
  formatJSTHHmm,
  formatJSTYmdHm,
} from "@/lib/time";
import { withdrawRequest } from "../actions";
import { ResubmitForm } from "./resubmit-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ actor?: string; submitted?: string }>;

function statusBadgeClass(status: string): string {
  switch (status as OvertimeStatus) {
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

export default async function OvertimeDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const actorId = sp.actor?.trim() || "";
  const submitted = sp.submitted === "1";

  const target = await prisma.overtimeRequest.findUnique({
    where: { id },
    include: {
      user: true,
      reviewer: true,
      parent: true,
    },
  });

  if (!target) {
    notFound();
  }

  const isOwner = !!actorId && target.userId === actorId;
  const status = target.status as OvertimeStatus;
  const reqType = target.requestType as RequestType;

  // 再申請フォーム用の workSites と regularEndTime
  const needsResubmitForm = isOwner && status === "sent_back";
  const [workSites, setting] = needsResubmitForm
    ? await Promise.all([
        prisma.workSite.findMany({
          where: { isActive: true },
          orderBy: [{ usageCount: "desc" }, { name: "asc" }],
        }),
        prisma.appSetting.findUnique({ where: { key: "regular_end_time" } }),
      ])
    : [[], null];

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">申請詳細</h1>
          <span className="subtitle">
            {STATUS_LABEL[status]}・{REQUEST_TYPE_LABEL[reqType]}申請
          </span>
        </div>
        <Link
          href={
            actorId
              ? `/overtime?actor=${encodeURIComponent(actorId)}`
              : "/overtime"
          }
          className="link"
        >
          ← 申請一覧
        </Link>
      </header>

      {submitted && (
        <div className="ot-banner ot-banner-success" role="status">
          <span className="ot-banner-icon" aria-hidden="true">
            ✓
          </span>
          <div className="ot-banner-body">
            申請を送信しました。承認待ちです。
          </div>
        </div>
      )}

      {target.parent && (
        <Link
          href={
            actorId
              ? `/overtime/${target.parent.id}?actor=${encodeURIComponent(actorId)}`
              : `/overtime/${target.parent.id}`
          }
          className="ot-parent-link"
        >
          ↩ これは再申請です（前回:{" "}
          {formatJSTDateWithWeekday(target.parent.workDate)} の申請）
        </Link>
      )}

      <div className="ot-status-row">
        <span className={statusBadgeClass(status)}>
          {STATUS_LABEL[status]}
        </span>
        <span>
          提出: <span className="num">{formatJSTYmdHm(target.createdAt)}</span>
        </span>
        {target.reviewedAt && target.reviewer && (
          <span>
            {status === "approved"
              ? "承認"
              : status === "rejected"
                ? "却下"
                : "差戻"}
            : <span className="num">{formatJSTYmdHm(target.reviewedAt)}</span> /{" "}
            {target.reviewer.name}
          </span>
        )}
      </div>

      {/* 差戻コメント */}
      {status === "sent_back" && target.reviewComment && (
        <div className="ot-banner ot-banner-warn" role="status">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>差戻コメント</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{target.reviewComment}</div>
          </div>
        </div>
      )}

      {/* 却下コメント */}
      {status === "rejected" && target.reviewComment && (
        <div className="ot-banner ot-banner-danger" role="status">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>却下コメント</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{target.reviewComment}</div>
          </div>
        </div>
      )}

      <div className="ot-detail-card">
        <table className="ot-detail-table">
          <tbody>
            <tr>
              <th scope="row">申請者</th>
              <td>{target.user.name}</td>
            </tr>
            <tr>
              <th scope="row">申請種別</th>
              <td>
                <span
                  className={
                    reqType === "pre"
                      ? "badge ot-badge-pre"
                      : "badge ot-badge-post"
                  }
                >
                  {REQUEST_TYPE_LABEL[reqType]}申請
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">申請日</th>
              <td className="num">
                {formatJSTDateWithWeekday(target.workDate)}
              </td>
            </tr>
            <tr>
              <th scope="row">残業時間</th>
              <td>
                <span className="num">
                  {formatJSTHHmm(target.startAt)} 〜{" "}
                  {formatJSTHHmm(target.endAt)}
                </span>
                <span className="ot-detail-duration">
                  （{formatDurationJa(target.durationMinutes)}）
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">現場名</th>
              <td>{target.workSiteName}</td>
            </tr>
            <tr>
              <th scope="row">作業内容</th>
              <td>{target.description}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* アクション */}
      {isOwner && status === "submitted" && (
        <form action={withdrawRequest} className="ot-btn-row" style={{ marginTop: 24 }}>
          <input type="hidden" name="id" value={target.id} />
          <input type="hidden" name="userId" value={target.userId} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            まだ承認されていません。取り消し可能です。
          </span>
          <span className="ot-btn-row-end">
            <button type="submit" className="ot-btn-danger">
              申請を取り消す
            </button>
          </span>
        </form>
      )}

      {/* 再申請フォーム */}
      {needsResubmitForm && (
        <section
          className="section"
          aria-labelledby="ot-resubmit-heading"
          style={{ marginTop: 32 }}
        >
          <div className="section-head">
            <h2 id="ot-resubmit-heading" className="section-title">
              この申請を再提出する
            </h2>
            <span className="section-sub">
              内容を見直して再申請してください
            </span>
          </div>

          <ResubmitForm
            parentId={target.id}
            userId={target.userId}
            userName={target.user.name}
            defaultRequestType={reqType}
            defaultWorkDate={toYmd(target.workDate)}
            defaultStartTime={formatJSTHHmm(target.startAt)}
            defaultEndTime={formatJSTHHmm(target.endAt)}
            defaultWorkSiteName={target.workSiteName}
            defaultDescription={target.description}
            regularEndTime={setting?.value ?? "17:30"}
            workSites={workSites.map((w) => ({ id: w.id, name: w.name }))}
          />
        </section>
      )}
    </main>
  );
}

function toYmd(date: Date): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
