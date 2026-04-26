import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/admin-auth";
import {
  buildMonthlyOvertimeRows,
  buildMonthlyTotals,
} from "@/lib/overtime-aggregate";
import {
  startOfMonthJST,
  endOfMonthJST,
  formatJSTYmd,
} from "@/lib/time";
import { formatDuration, formatDurationJa } from "@/lib/overtime";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ym?: string }>;

export default async function AdminOvertimeReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/overtime/report");
  }

  const sp = await searchParams;
  const now = new Date();
  const todayYm = formatJSTYmd(now).slice(0, 7);
  const ym = parseYm(sp.ym) ?? todayYm;
  const [y, m] = ym.split("-").map(Number);

  const monthStart = startOfMonthJST(y, m);
  const monthEnd = endOfMonthJST(y, m);

  const [users, records, requests] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.timeRecord.findMany({
      where: { timestamp: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.overtimeRequest.findMany({
      where: { workDate: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  const rows = buildMonthlyOvertimeRows({
    users,
    records,
    requests,
    monthStart,
    monthEnd,
  });
  const totals = buildMonthlyTotals(rows);

  const prevYm = shiftYm(ym, -1);
  const nextYm = shiftYm(ym, 1);
  const monthLabel = `${y}年${m}月`;

  return (
    <main className="container-wide">
      <header className="header">
        <div>
          <h1 className="title">残業 月次レポート</h1>
          <span className="subtitle">実労働 vs 申請残業の突合</span>
        </div>
        <div className="ot-admin-actions">
          <Link href="/admin/overtime" className="link">
            承認キュー
          </Link>
          <Link href="/admin/settings/overtime" className="link">
            設定
          </Link>
          <Link href="/admin" className="link">
            ← 管理
          </Link>
        </div>
      </header>

      {/* 月切替 + CSVボタン */}
      <section
        className="section"
        aria-labelledby="ot-month-heading"
        style={{ marginTop: 8 }}
      >
        <div className="section-head">
          <h2 id="ot-month-heading" className="section-title">
            対象月
          </h2>
          <span className="section-sub tabular">
            {formatJSTYmd(monthStart)} 〜{" "}
            {formatJSTYmd(new Date(monthEnd.getTime() - 1))}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <nav className="ot-month-nav" aria-label="月切替">
            <Link
              href={`/admin/overtime/report?ym=${prevYm}`}
              className="ot-month-nav-btn"
              aria-label="前月へ"
            >
              ‹
            </Link>
            <span className="ot-month-nav-current">{monthLabel}</span>
            <Link
              href={`/admin/overtime/report?ym=${nextYm}`}
              className="ot-month-nav-btn"
              aria-label="翌月へ"
            >
              ›
            </Link>
          </nav>

          <form
            method="GET"
            action="/admin/overtime/report"
            style={{ display: "inline-flex", gap: 8 }}
          >
            <input
              type="month"
              name="ym"
              defaultValue={ym}
              className="ot-input"
              style={{ width: "auto", minWidth: 160 }}
            />
            <button type="submit" className="ot-btn-secondary">
              表示
            </button>
          </form>

          <div style={{ flex: 1 }} />

          <a
            href={`/api/admin/overtime/report?ym=${ym}`}
            className="ot-btn-secondary"
            download
          >
            CSV（承認済）
          </a>
          <a
            href={`/api/admin/overtime/report?ym=${ym}&status=all`}
            className="ot-btn-ghost"
            download
          >
            全件CSV
          </a>
        </div>
      </section>

      {/* 月次合計 */}
      <section className="section" aria-labelledby="ot-totals-heading">
        <div className="section-head">
          <h2 id="ot-totals-heading" className="section-title">
            月次合計
          </h2>
        </div>
        <div className="ot-totals-row">
          <div className="card">
            <div className="card-head">
              <span className="card-label">承認済 残業合計</span>
            </div>
            <div className="card-value">
              {formatDurationJa(totals.approvedOvertimeMinutes)}
            </div>
            <div className="card-foot">確定済の残業</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">申請中 残業</span>
            </div>
            <div className="card-value">
              {formatDurationJa(totals.pendingOvertimeMinutes)}
            </div>
            <div className="card-foot">申請中 + 差戻 の合計</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">却下 残業</span>
            </div>
            <div className="card-value">
              {formatDurationJa(totals.rejectedOvertimeMinutes)}
            </div>
            <div className="card-foot">却下となった残業</div>
          </div>
          <div className="card">
            <div className="card-head">
              <span className="card-label">差分注意者</span>
            </div>
            <div className="card-value">
              {totals.diffPositiveCount}
              <span className="card-unit">名</span>
            </div>
            <div className="card-foot card-foot-warn">
              実労働に対し残業申請が不足
            </div>
          </div>
        </div>
      </section>

      {/* メインテーブル */}
      <section className="section" aria-labelledby="ot-rows-heading">
        <div className="section-head">
          <h2 id="ot-rows-heading" className="section-title">
            ユーザー別 集計
          </h2>
          <span className="section-sub tabular">{rows.length} 名</span>
        </div>

        {rows.length === 0 ? (
          <div className="ot-empty">
            <div className="ot-empty-title">
              対象月に該当するデータがありません
            </div>
            <div>従業員が登録されていないか、{monthLabel}の打刻・申請が0件です</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table ot-report-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th style={{ textAlign: "right", width: 80 }}>出勤日数</th>
                  <th style={{ textAlign: "right", width: 100 }}>実労働</th>
                  <th style={{ textAlign: "right", width: 110 }}>承認済残業</th>
                  <th style={{ textAlign: "right", width: 100 }}>申請中</th>
                  <th style={{ textAlign: "right", width: 110 }}>差分</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isWarn = r.diffMinutes > 0;
                  return (
                    <tr key={r.userId} className={isWarn ? "is-row-warn" : undefined}>
                      <td style={{ fontWeight: 600, color: "var(--text)" }}>
                        {r.userName}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.workedDays === 0 ? (
                          <span className="ot-cell-num-muted">—</span>
                        ) : (
                          <>
                            {r.workedDays}
                            <span style={{ marginLeft: 2, color: "var(--muted)", fontWeight: 500 }}>
                              日
                            </span>
                          </>
                        )}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.workedMinutes === 0 ? (
                          <span className="ot-cell-num-muted">—</span>
                        ) : (
                          formatDuration(r.workedMinutes)
                        )}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.approvedOvertimeMinutes === 0 ? (
                          <span className="ot-cell-num-muted">0:00</span>
                        ) : (
                          formatDuration(r.approvedOvertimeMinutes)
                        )}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.pendingOvertimeMinutes === 0 ? (
                          <span className="ot-cell-num-muted">0:00</span>
                        ) : (
                          formatDuration(r.pendingOvertimeMinutes)
                        )}
                      </td>
                      <td
                        className={
                          isWarn
                            ? "num ot-cell-warn"
                            : "num ot-cell-num-muted"
                        }
                        style={{ textAlign: "right" }}
                      >
                        {isWarn ? (
                          <>
                            <span aria-hidden="true">⚠ </span>
                            +{formatDuration(r.diffMinutes)}
                          </>
                        ) : r.diffMinutes < 0 ? (
                          formatDuration(r.diffMinutes)
                        ) : (
                          "0:00"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function parseYm(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return value;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}
