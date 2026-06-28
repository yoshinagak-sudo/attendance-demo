import { unstable_noStore as noStore } from "next/cache";
import { Calendar, Users, CalendarDays, Timer, AlertTriangle } from "lucide-react";
import { requireDashboardSession } from "../_lib/require-dashboard";
import { getMonthlyAggregate } from "../_lib/data";
import { formatMinutesJa } from "@/lib/daily-report";

export const dynamic = "force-dynamic";

function formatYearMonthJa(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${y}年${Number(m)}月`;
}

export default async function MonthlyPage() {
  noStore();
  await requireDashboardSession();
  const { yearMonth, rows } = await getMonthlyAggregate();

  const activeUsers = rows.filter((r) => r.workDays > 0).length;
  const totalWorkDays = rows.reduce((s, r) => s + r.workDays, 0);
  const totalWorkMinutes = rows.reduce((s, r) => s + r.workMinutes, 0);
  const totalOvertimeMinutes = rows.reduce(
    (s, r) => s + r.overtimeMinutes,
    0,
  );

  // 勤務時間が多い順（0 は末尾）
  const sortedRows = [...rows].sort((a, b) => b.workMinutes - a.workMinutes);

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">月次集計</span>
          <h1 className="dash-page-title">月次集計</h1>
          <span className="dash-page-sub">
            社員ごとの勤務日数・勤務時間・残業時間
          </span>
        </div>
        <div className="dash-page-side">
          <Calendar size={16} aria-hidden="true" />
          {formatYearMonthJa(yearMonth)}
        </div>
      </header>

      <section className="dash-cards" aria-label="月次サマリ">
        <article className="dash-card dash-card-accent">
          <div className="dash-card-head">
            <Users aria-hidden="true" />
            稼働社員
          </div>
          <div className="dash-card-value">
            {activeUsers}
            <span className="dash-card-unit">/ {rows.length} 名</span>
          </div>
          <div className="dash-card-note">今月1日以上勤務した社員</div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <CalendarDays aria-hidden="true" />
            総勤務日数
          </div>
          <div className="dash-card-value">
            {totalWorkDays}
            <span className="dash-card-unit">日</span>
          </div>
          <div className="dash-card-note">全社員の合計</div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <Timer aria-hidden="true" />
            総勤務時間
          </div>
          <div className="dash-card-value">
            {formatMinutesJa(totalWorkMinutes)}
          </div>
          <div className="dash-card-note">出勤〜退勤の累計</div>
        </article>

        <article
          className={`dash-card${
            totalOvertimeMinutes > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <AlertTriangle aria-hidden="true" />
            総残業時間
          </div>
          <div className="dash-card-value">
            {formatMinutesJa(totalOvertimeMinutes)}
          </div>
          <div className="dash-card-note">承認済み残業申請の合算</div>
        </article>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">社員別 集計</h2>
          <span className="dash-section-sub">{rows.length} 名</span>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">対象となる社員データがありません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">社員</th>
                    <th scope="col">勤務日数</th>
                    <th scope="col">勤務時間</th>
                    <th scope="col">残業時間</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.userId}>
                      <td className="dash-td-name">{row.userName}</td>
                      <td className="dash-td-num">
                        {row.workDays > 0 ? (
                          <>
                            {row.workDays}
                            <span className="dash-td-muted"> 日</span>
                          </>
                        ) : (
                          <span className="dash-td-muted">—</span>
                        )}
                      </td>
                      <td className="dash-td-num">
                        {row.workMinutes > 0 ? (
                          formatMinutesJa(row.workMinutes)
                        ) : (
                          <span className="dash-td-muted">—</span>
                        )}
                      </td>
                      <td
                        className={
                          row.overtimeMinutes > 0
                            ? "dash-td-num dash-td-warn"
                            : "dash-td-num dash-td-muted"
                        }
                      >
                        {row.overtimeMinutes > 0
                          ? formatMinutesJa(row.overtimeMinutes)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="dash-row-total">
                    <td className="dash-td-name">合計</td>
                    <td className="dash-td-num">
                      {totalWorkDays}
                      <span className="dash-td-muted"> 日</span>
                    </td>
                    <td className="dash-td-num">
                      {formatMinutesJa(totalWorkMinutes)}
                    </td>
                    <td
                      className={
                        totalOvertimeMinutes > 0
                          ? "dash-td-num dash-td-warn"
                          : "dash-td-num dash-td-muted"
                      }
                    >
                      {totalOvertimeMinutes > 0
                        ? formatMinutesJa(totalOvertimeMinutes)
                        : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
