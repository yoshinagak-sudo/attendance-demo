import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatJSTHHmm, formatJSTYmd, formatJSTYmdHm } from "@/lib/time";
import {
  STATUS_LABEL,
  formatMinutesJa,
  formatMinutesHm,
  ACK_COMMENT_MAX_CHARS,
  type ReportStatus,
} from "@/lib/daily-report";
import { acknowledgeReport, unacknowledgeReport } from "@/app/admin/report/actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ reviewed?: string; reset?: string; error?: string }>;

export default async function AdminReportDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await requireManager("/admin/report");
  const { id } = await params;
  const sp = await searchParams;
  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: {
      items: { orderBy: { orderIndex: "asc" } },
      user: true,
      acknowledgedBy: true,
    },
  });
  if (!report) notFound();
  const status = report.status as ReportStatus;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">日報詳細</h1>
            <span className="subtitle">
              {formatJSTYmd(report.reportDate)}・{report.user.name}
            </span>
          </div>
          <Link href="/admin/report" className="link">← 戻る</Link>
        </header>

        {sp.reviewed && (
          <div className="ot-toast" role="status">確認済にしました</div>
        )}
        {sp.reset && (
          <div className="ot-toast" role="status">下書きに戻しました</div>
        )}
        {sp.error && (
          <div className="ot-banner ot-banner-danger" role="alert">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-body">{sp.error}</div>
          </div>
        )}

        <div className="ot-detail-card card">
          <div className="ot-detail-row">
            <span className="ot-detail-label">状態</span>
            <span className={`badge dr-badge-${status}`}>{STATUS_LABEL[status]}</span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">合計工数</span>
            <span className="num">{formatMinutesJa(report.totalMinutes)}</span>
          </div>
          {report.submittedAt && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">提出時刻</span>
              <span className="num">{formatJSTYmdHm(report.submittedAt)}</span>
            </div>
          )}
          {report.acknowledgedAt && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">確認</span>
              <span>
                {report.acknowledgedBy?.name}・<span className="num">{formatJSTYmdHm(report.acknowledgedAt)}</span>
              </span>
            </div>
          )}
          {report.ackComment && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">コメント</span>
              <span>{report.ackComment}</span>
            </div>
          )}
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">作業アイテム</h2>
            <span className="section-sub tabular">{report.items.length} 件</span>
          </div>
          <ul className="dr-item-list dr-item-list-view">
            {report.items.map((it, idx) => (
              <li key={it.id} className="dr-item-card">
                <div className="dr-item-head">
                  <span className="dr-item-num">#{idx + 1}</span>
                  <span className="num dr-item-duration">{formatMinutesHm(it.durationMinutes)}</span>
                </div>
                <div className="dr-item-time num">
                  {formatJSTHHmm(it.startAt)} 〜 {formatJSTHHmm(it.endAt)}
                </div>
                <div className="dr-item-site">{it.workSiteName}</div>
                <div className="dr-item-text">{it.description}</div>
              </li>
            ))}
          </ul>
        </section>

        {report.progressNote && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">進捗・申し送り</h2>
            </div>
            <div className="card" style={{ whiteSpace: "pre-wrap", padding: 16, lineHeight: 1.7 }}>
              {report.progressNote}
            </div>
          </section>
        )}

        {status === "submitted" && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">確認操作</h2>
            </div>
            <form action={acknowledgeReport} className="ot-form">
              <input type="hidden" name="id" value={report.id} />
              <div className="ot-field">
                <label className="ot-field-label" htmlFor="ackComment">コメント（任意）</label>
                <textarea
                  id="ackComment"
                  name="ackComment"
                  rows={3}
                  maxLength={ACK_COMMENT_MAX_CHARS}
                  className="ot-input"
                  placeholder="任意のコメント。空欄でも確認済にできます"
                />
              </div>
              <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block">
                確認済にする
              </button>
            </form>
          </section>
        )}

        {status === "acknowledged" && (
          <form action={unacknowledgeReport} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={report.id} />
            <button type="submit" className="link" style={{ color: "var(--warn)" }}>
              確認を取り消す（下書きに戻す）
            </button>
          </form>
        )}
      </main>
    </>
  );
}
