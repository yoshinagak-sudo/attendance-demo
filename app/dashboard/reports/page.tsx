import { unstable_noStore as noStore } from "next/cache";
import { FileText } from "lucide-react";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import { getReportsList } from "@/app/dashboard/_lib/data";
import { formatJSTYmd } from "@/lib/time";
import { formatMinutesJa } from "@/lib/daily-report";

export const dynamic = "force-dynamic";

const REPORT_STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  submitted: "提出済",
  acknowledged: "確認済",
};

function truncate(text: string, max: number): string {
  if (!text) return "";
  const arr = [...text];
  if (arr.length <= max) return text;
  return `${arr.slice(0, max).join("")}…`;
}

function statusBadge(status: string) {
  if (status === "acknowledged") {
    return <span className="dash-badge dash-badge-primary">確認済</span>;
  }
  if (status === "submitted") {
    return <span className="dash-badge dash-badge-warn">提出済</span>;
  }
  if (status === "draft") {
    return <span className="dash-badge dash-badge-muted">下書き</span>;
  }
  return (
    <span className="dash-badge dash-badge-done">
      {REPORT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function rowClass(
  acknowledgedAt: Date | null,
  status: string,
): string | undefined {
  if (acknowledgedAt) return "dash-row-acked";
  if (status === "submitted") return "dash-row-pending";
  return undefined;
}

export default async function ReportsPage() {
  noStore();
  await requireDashboardSession();
  const rows = await getReportsList();

  const ackCount = rows.filter((r) => r.acknowledgedAt).length;
  const pendingCount = rows.filter(
    (r) => !r.acknowledgedAt && r.status === "submitted",
  ).length;
  const draftCount = rows.filter((r) => r.status === "draft").length;

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">日報</span>
          <h1 className="dash-page-title">日報一覧（最新 200 件）</h1>
          <span className="dash-page-sub">
            日付ごとの提出状況・作業時間の閲覧専用ビュー
          </span>
        </div>
        <div className="dash-page-side">
          <FileText size={16} aria-hidden="true" />
          {rows.length} 件
        </div>
      </header>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">日報一覧</h2>
          <span className="dash-section-sub">
            提出済(未確認) {pendingCount} 件 / 確認済 {ackCount} 件 / 下書き{" "}
            {draftCount} 件
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">日報はまだありません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">日付</th>
                    <th scope="col">名前</th>
                    <th scope="col">状態</th>
                    <th scope="col">件数</th>
                    <th scope="col">合計時間</th>
                    <th scope="col">進捗メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cls = rowClass(r.acknowledgedAt, r.status);
                    return (
                      <tr key={r.id} className={cls}>
                        <td className="dash-td-num">
                          {formatJSTYmd(r.reportDate)}
                        </td>
                        <td className="dash-td-name">{r.userName}</td>
                        <td>{statusBadge(r.status)}</td>
                        <td className="dash-td-num">
                          {r.itemsCount}
                          <span className="dash-td-muted"> 件</span>
                        </td>
                        <td className="dash-td-num">
                          {r.totalMinutes > 0 ? (
                            formatMinutesJa(r.totalMinutes)
                          ) : (
                            <span className="dash-td-muted">—</span>
                          )}
                        </td>
                        <td>
                          {r.progressNote ? (
                            <span className="dash-td-text">
                              {truncate(r.progressNote, 40)}
                            </span>
                          ) : (
                            <span className="dash-td-text dash-td-text-empty">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="dash-note">
        この画面は閲覧専用です。日報の確認操作（コメント・確認済化）は社員向け勤怠アプリの管理画面から行ってください。
      </div>
    </>
  );
}
