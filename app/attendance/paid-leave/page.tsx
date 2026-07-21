import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { computePaidLeaveBalance } from "@/lib/paid-leave";
import { formatLeaveDays } from "@/lib/attendance-request";
import { formatJSTYmd } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";

export const dynamic = "force-dynamic";

export default async function PaidLeavePage() {
  const session = await requireSession("/attendance/paid-leave");

  const [grants, consumptions] = await Promise.all([
    prisma.paidLeaveGrant.findMany({
      where: { userId: session.id },
      orderBy: { grantedOn: "desc" },
    }),
    prisma.attendanceRequest.findMany({
      where: {
        userId: session.id,
        category: "paid_leave",
        status: { in: ["submitted", "approved"] },
      },
      select: { id: true, workDate: true, leaveDays: true, status: true },
      orderBy: { workDate: "desc" },
    }),
  ]);

  const balance = computePaidLeaveBalance(
    grants.map((g) => ({ id: g.id, grantedOn: g.grantedOn, expiresOn: g.expiresOn, days: g.days })),
    consumptions.map((c) => ({
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
            <h1 className="title">年次有給休暇</h1>
            <span className="subtitle">残日数・付与履歴・消化履歴</span>
          </div>
          <Link href="/attendance" className="link">
            ← 申請一覧
          </Link>
        </header>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">残日数</h2>
          </div>
          <div className="cards">
            <div className="card">
              <div className="card-head">
                <span className="card-label">残</span>
              </div>
              <div className="card-value">{formatLeaveDays(balance.remaining)}</div>
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

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">付与履歴</h2>
            <span className="section-sub tabular">全 {grants.length} 件</span>
          </div>
          {grants.length === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">付与記録がありません</div>
              <div>入社日が未設定の場合は管理者に連絡してください</div>
            </div>
          ) : (
            <ul className="ot-history-list" style={{ listStyle: "none", padding: 0 }}>
              {grants.map((g) => {
                const isExpired = g.expiresOn.getTime() <= Date.now();
                const perGrant = balance.perGrant.find((p) => p.id === g.id);
                return (
                  <li key={g.id} className="ot-history-row" style={{ cursor: "default" }}>
                    <div className="ot-history-main">
                      <div className="ot-history-date">
                        {formatJSTYmd(g.grantedOn)} 付与
                        <span
                          style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 12 }}
                        >
                          {g.source === "auto" ? "自動" : "手動"}
                          {g.note ? `・${g.note}` : ""}
                        </span>
                      </div>
                      <div className="ot-history-detail">
                        {formatLeaveDays(g.days)}
                        {perGrant && !isExpired && (
                          <span style={{ marginLeft: 8, color: "var(--muted)" }}>
                            残 {formatLeaveDays(perGrant.remaining)}
                          </span>
                        )}
                        {" ・ "}
                        {formatJSTYmd(g.expiresOn)} 失効
                      </div>
                    </div>
                    <div className="ot-history-side">
                      <span
                        className={`badge ${
                          isExpired ? "ot-badge-rejected" : "ot-badge-approved"
                        }`}
                      >
                        {isExpired ? "失効" : "有効"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">消化履歴（申請中 + 承認済）</h2>
            <span className="section-sub tabular">全 {consumptions.length} 件</span>
          </div>
          {consumptions.length === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">消化はありません</div>
            </div>
          ) : (
            <ul className="ot-history-list" style={{ listStyle: "none", padding: 0 }}>
              {consumptions.map((c) => (
                <li key={c.id} className="ot-history-row" style={{ cursor: "default" }}>
                  <div className="ot-history-main">
                    <div className="ot-history-date">{formatJSTYmd(c.workDate)}</div>
                    <div className="ot-history-detail">{formatLeaveDays(c.leaveDays)}</div>
                  </div>
                  <div className="ot-history-side">
                    <span
                      className={`badge ${
                        c.status === "approved" ? "ot-badge-approved" : "ot-badge-submitted"
                      }`}
                    >
                      {c.status === "approved" ? "承認済" : "申請中"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
