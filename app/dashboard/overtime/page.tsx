import { unstable_noStore as noStore } from "next/cache";
import {
  Clock,
  Inbox,
  CheckCircle2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import { getOvertimeList } from "@/app/dashboard/_lib/data";
import { formatJSTYmd, formatJSTHHmm } from "@/lib/time";
import { formatMinutesJa } from "@/lib/daily-report";

export const dynamic = "force-dynamic";

function truncate(text: string, max: number): string {
  if (!text) return "";
  const arr = [...text];
  if (arr.length <= max) return text;
  return `${arr.slice(0, max).join("")}…`;
}

function statusBadge(status: string) {
  if (status === "approved") {
    return (
      <span className="dash-badge dash-badge-primary">承認済</span>
    );
  }
  if (status === "submitted") {
    return <span className="dash-badge dash-badge-warn">未承認</span>;
  }
  if (status === "sent_back") {
    return <span className="dash-badge dash-badge-accent">差戻</span>;
  }
  if (status === "rejected") {
    return <span className="dash-badge dash-badge-danger">却下</span>;
  }
  return <span className="dash-badge dash-badge-done">{status}</span>;
}

function requestTypeTag(requestType: string) {
  if (requestType === "pre") {
    return <span className="dash-typetag dash-typetag-pre">事前</span>;
  }
  if (requestType === "post") {
    return <span className="dash-typetag dash-typetag-post">事後</span>;
  }
  return <span className="dash-typetag">{requestType}</span>;
}

export default async function OvertimePage() {
  noStore();
  await requireDashboardSession();
  const { counts, rows } = await getOvertimeList();

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">残業申請</span>
          <h1 className="dash-page-title">残業申請</h1>
          <span className="dash-page-sub">
            提出された残業申請の状況（最新 {rows.length} 件、閲覧専用）
          </span>
        </div>
        <div className="dash-page-side">
          <Clock size={16} aria-hidden="true" />
          {rows.length} 件
        </div>
      </header>

      <section className="dash-cards" aria-label="残業申請ステータス">
        <article className="dash-card dash-card-warn">
          <div className="dash-card-head">
            <Inbox aria-hidden="true" />
            未承認
          </div>
          <div className="dash-card-value">
            {counts.submitted}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">承認・差戻待ち</div>
        </article>

        <article className="dash-card dash-card-primary">
          <div className="dash-card-head">
            <CheckCircle2 aria-hidden="true" />
            承認済
          </div>
          <div className="dash-card-value">
            {counts.approved}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">承認済み（最新200件中）</div>
        </article>

        <article className="dash-card dash-card-info">
          <div className="dash-card-head">
            <RotateCcw aria-hidden="true" />
            差戻
          </div>
          <div className="dash-card-value">
            {counts.sent_back}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">修正依頼中（再申請待ち）</div>
        </article>

        <article
          className={`dash-card${
            counts.rejected > 0 ? " dash-card-danger" : ""
          }`}
        >
          <div className="dash-card-head">
            <XCircle aria-hidden="true" />
            却下
          </div>
          <div className="dash-card-value">
            {counts.rejected}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">却下済み</div>
        </article>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">申請一覧</h2>
          <span className="dash-section-sub">直近 {rows.length} 件</span>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">残業申請はまだありません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">日付</th>
                    <th scope="col">申請者</th>
                    <th scope="col">時間</th>
                    <th scope="col">分数</th>
                    <th scope="col">現場</th>
                    <th scope="col">内容</th>
                    <th scope="col">ステータス</th>
                    <th scope="col">種別</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td className="dash-td-num">
                        {formatJSTYmd(o.workDate)}
                      </td>
                      <td className="dash-td-name">{o.userName}</td>
                      <td>
                        <span className="dash-time-range">
                          {formatJSTHHmm(o.startAt)}
                          <span className="dash-time-sep">–</span>
                          {o.endAt ? formatJSTHHmm(o.endAt) : "—"}
                        </span>
                      </td>
                      <td className="dash-td-num">
                        {formatMinutesJa(o.durationMinutes)}
                      </td>
                      <td>
                        {o.workSiteName || (
                          <span className="dash-td-muted">—</span>
                        )}
                      </td>
                      <td>
                        {o.description ? (
                          <span className="dash-td-text">
                            {truncate(o.description, 30)}
                          </span>
                        ) : (
                          <span className="dash-td-text dash-td-text-empty">
                            —
                          </span>
                        )}
                      </td>
                      <td>{statusBadge(o.status)}</td>
                      <td>{requestTypeTag(o.requestType)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="dash-note">
        この画面は閲覧専用です。承認・差戻・却下の操作は社員向け勤怠アプリの管理画面から行ってください。
      </div>
    </>
  );
}
