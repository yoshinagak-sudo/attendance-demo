import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import {
  grantPaidLeaveAction,
  runAutoPaidLeaveGrantAction,
} from "@/app/attendance/actions";
import { computePaidLeaveBalance } from "@/lib/paid-leave";
import { formatLeaveDays } from "@/lib/attendance-request";
import { formatJSTYmd } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ granted?: string; autoGrant?: string; error?: string }>;

export default async function AdminPaidLeavePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireManager("/admin/paid-leave");
  const sp = await searchParams;
  const granted = sp.granted === "1";
  const autoGrant = sp.autoGrant?.split(",");
  const error = sp.error;

  const [users, allGrants, allConsumptions] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, hireDate: true },
    }),
    prisma.paidLeaveGrant.findMany({ orderBy: { grantedOn: "desc" } }),
    prisma.attendanceRequest.findMany({
      where: { category: "paid_leave", status: { in: ["submitted", "approved"] } },
      select: { id: true, userId: true, workDate: true, leaveDays: true, status: true },
    }),
  ]);

  const grantsByUser = new Map<string, typeof allGrants>();
  for (const g of allGrants) {
    const arr = grantsByUser.get(g.userId) ?? [];
    arr.push(g);
    grantsByUser.set(g.userId, arr);
  }
  const consByUser = new Map<string, typeof allConsumptions>();
  for (const c of allConsumptions) {
    const arr = consByUser.get(c.userId) ?? [];
    arr.push(c);
    consByUser.set(c.userId, arr);
  }

  const balances = users.map((u) => {
    const grants = grantsByUser.get(u.id) ?? [];
    const cons = consByUser.get(u.id) ?? [];
    const balance = computePaidLeaveBalance(
      grants.map((g) => ({ id: g.id, grantedOn: g.grantedOn, expiresOn: g.expiresOn, days: g.days })),
      cons.map((c) => ({
        id: c.id,
        workDate: c.workDate,
        leaveDays: c.leaveDays ?? 0,
        status: c.status as "submitted" | "approved",
      })),
    );
    return { user: u, balance };
  });

  return (
    <>
      <AppHeader user={session} />
      <main className="container-wide">
        <header className="header">
          <div>
            <h1 className="title">有給付与</h1>
            <span className="subtitle">手動付与・自動付与実行・ユーザー別残日数</span>
          </div>
          <Link href="/admin" className="link">
            ← 管理
          </Link>
        </header>

        {granted && (
          <div className="ot-banner ot-banner-success" role="status">
            <span className="ot-banner-icon" aria-hidden="true">✓</span>
            <div className="ot-banner-body">付与しました</div>
          </div>
        )}
        {autoGrant && (
          <div className="ot-banner ot-banner-success" role="status">
            <span className="ot-banner-icon" aria-hidden="true">✓</span>
            <div className="ot-banner-body">
              自動付与を実行しました（新規 {autoGrant[0] ?? 0} 件 / 既存スキップ {autoGrant[1] ?? 0} 件）
            </div>
          </div>
        )}
        {error && (
          <div className="ot-banner ot-banner-danger" role="alert">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-body">{error}</div>
          </div>
        )}

        <section className="ot-form-card">
          <h2 className="ot-section-title">手動で付与</h2>
          <form action={grantPaidLeaveAction} className="ot-form">
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="userId">対象ユーザー</label>
              <select id="userId" name="userId" required className="ot-input">
                <option value="">選択</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="days">付与日数</label>
              <input id="days" name="days" type="number" step="0.5" min="0.5" required placeholder="例: 10" className="ot-input" />
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="grantedOn">付与日</label>
              <input id="grantedOn" name="grantedOn" type="date" required defaultValue={formatJSTYmd(new Date())} className="ot-input" />
              <p className="ot-field-help">この日から 2 年間有効</p>
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="note">メモ（任意）</label>
              <input id="note" name="note" type="text" maxLength={200} placeholder="例: 中途入社の付与調整" className="ot-input" />
            </div>
            <button type="submit" className="ot-btn-primary">付与する</button>
          </form>
        </section>

        <section className="ot-form-card">
          <h2 className="ot-section-title">自動付与を実行</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            入社日 (hireDate) が設定されている全アクティブユーザーについて、労基法どおりの付与予定日（6ヶ月, 1年6ヶ月, 2年6ヶ月, ...）を確認し、未付与のものがあれば付与します。冪等なので何度実行しても安全です。
          </p>
          <form action={runAutoPaidLeaveGrantAction}>
            <button type="submit" className="ot-btn-secondary">今すぐ実行</button>
          </form>
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">ユーザー別 残日数</h2>
            <span className="section-sub tabular">全 {users.length} 名</span>
          </div>
          <div className="table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>入社日</th>
                  <th style={{ width: 100 }}>残</th>
                  <th style={{ width: 120 }}>承認済 消化</th>
                  <th style={{ width: 120 }}>申請中</th>
                  <th style={{ width: 140 }}>次の失効</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(({ user, balance }) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td className="num">{user.hireDate ? formatJSTYmd(user.hireDate) : "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{formatLeaveDays(balance.remaining)}</td>
                    <td className="num">{formatLeaveDays(balance.usedApproved)}</td>
                    <td className="num">{formatLeaveDays(balance.usedPending)}</td>
                    <td>
                      {balance.nextExpiry ? (
                        <span className="num">
                          {formatLeaveDays(balance.nextExpiry.days)} / {formatJSTYmd(balance.nextExpiry.expiresOn)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted-2)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
