import { unstable_noStore as noStore } from "next/cache";
import { Clock, Users, UserCheck, UserX, Timer } from "lucide-react";
import { requireDashboardSession } from "./_lib/require-dashboard";
import { getTodayOverview } from "./_lib/data";
import { formatMinutesJa } from "@/lib/daily-report";
import type { Session } from "@/lib/attendance";

export const dynamic = "force-dynamic";

function formatJstHm(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatJstFullDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

type UserRow = {
  userId: string;
  userName: string;
  firstIn: Date | null;
  lastOut: Date | null;
  totalMinutes: number;
  status: "working" | "finished";
};

/** 社員ごとに当日打刻をまとめる（複数セッションは合算） */
function aggregateByUser(sessions: Session[]): UserRow[] {
  const map = new Map<string, UserRow>();
  for (const s of sessions) {
    const row = map.get(s.userId) ?? {
      userId: s.userId,
      userName: s.userName,
      firstIn: null,
      lastOut: null,
      totalMinutes: 0,
      status: "finished" as const,
    };
    if (!row.firstIn || s.startAt < row.firstIn) row.firstIn = s.startAt;
    if (s.endAt) {
      if (!row.lastOut || s.endAt > row.lastOut) row.lastOut = s.endAt;
    } else {
      row.status = "working";
    }
    row.totalMinutes += s.durationMinutes;
    map.set(s.userId, row);
  }
  // 出勤時刻順
  return Array.from(map.values()).sort((a, b) => {
    if (!a.firstIn) return 1;
    if (!b.firstIn) return -1;
    return a.firstIn.getTime() - b.firstIn.getTime();
  });
}

export default async function DashboardHomePage() {
  noStore();
  await requireDashboardSession();
  const overview = await getTodayOverview();
  const rows = aggregateByUser(overview.sessions);
  const now = new Date();

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">出勤状況</span>
          <h1 className="dash-page-title">今日の出勤状況</h1>
          <span className="dash-page-sub">{formatJstFullDate(now)}</span>
        </div>
        <div className="dash-page-side">
          <Clock size={16} aria-hidden="true" />
          現在 {formatJstHm(now)}
        </div>
      </header>

      <section
        className="dash-cards"
        aria-label="本日のサマリ"
      >
        <article className="dash-card dash-card-accent">
          <div className="dash-card-head">
            <UserCheck aria-hidden="true" />
            出勤中
          </div>
          <div className="dash-card-value">
            {overview.working}
            <span className="dash-card-unit">名</span>
          </div>
          <div className="dash-card-note">
            全社員 {overview.totalActive} 名
          </div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <Users aria-hidden="true" />
            退勤済
          </div>
          <div className="dash-card-value">
            {overview.finished}
            <span className="dash-card-unit">名</span>
          </div>
          <div className="dash-card-note">本日中にすでに退勤済</div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <UserX aria-hidden="true" />
            未出勤
          </div>
          <div className="dash-card-value">
            {overview.notYet}
            <span className="dash-card-unit">名</span>
          </div>
          <div className="dash-card-note">本日まだ打刻のない社員</div>
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <Timer aria-hidden="true" />
            合計勤務時間
          </div>
          <div className="dash-card-value">
            {formatMinutesJa(overview.totalWorkMinutes)}
          </div>
          <div className="dash-card-note">出勤中の社員はここまでの累計</div>
        </article>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">今日の打刻</h2>
          <span className="dash-section-sub">
            打刻のあった {rows.length} 名
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">本日の打刻はまだありません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">社員</th>
                    <th scope="col">出勤</th>
                    <th scope="col">退勤</th>
                    <th scope="col">勤務時間</th>
                    <th scope="col">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.userId}>
                      <td className="dash-td-name">{row.userName}</td>
                      <td className="dash-td-num">
                        {formatJstHm(row.firstIn)}
                      </td>
                      <td className="dash-td-num">
                        {row.status === "working" ? (
                          <span className="dash-td-muted">—</span>
                        ) : (
                          formatJstHm(row.lastOut)
                        )}
                      </td>
                      <td className="dash-td-num">
                        {formatMinutesJa(row.totalMinutes)}
                      </td>
                      <td>
                        {row.status === "working" ? (
                          <span className="dash-badge dash-badge-working">
                            出勤中
                          </span>
                        ) : (
                          <span className="dash-badge dash-badge-done">
                            退勤済
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
