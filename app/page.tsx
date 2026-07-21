import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfTodayJST, formatJSTYmd } from "@/lib/time";
import { getSession } from "@/lib/session";
import { computePaidLeaveBalance } from "@/lib/paid-leave";
import { formatLeaveDays } from "@/lib/attendance-request";
import { AppHeader } from "./_components/AppHeader";
import { PunchPanel } from "./punch-panel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  // 管理者/開発者もホームから自分の打刻パネルを使えるようにする（強制リダイレクトしない）。
  // ログイン直後の遷移先は login/login-form.tsx の fallback=/admin で吸収する。

  const since = startOfTodayJST();
  const [records, inProgressDriving, grants, cons] = await Promise.all([
    prisma.timeRecord.findMany({
      where: { userId: session.id, timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
    }),
    prisma.drivingLog.findFirst({
      where: { userId: session.id, status: "in_progress" },
      include: { vehicle: true },
      orderBy: { startAt: "desc" },
    }),
    prisma.paidLeaveGrant.findMany({ where: { userId: session.id } }),
    prisma.attendanceRequest.findMany({
      where: {
        userId: session.id,
        category: "paid_leave",
        status: { in: ["submitted", "approved"] },
      },
      select: { id: true, workDate: true, leaveDays: true, status: true },
    }),
  ]);

  const balance = computePaidLeaveBalance(
    grants.map((g) => ({ id: g.id, grantedOn: g.grantedOn, expiresOn: g.expiresOn, days: g.days })),
    cons.map((c) => ({
      id: c.id,
      workDate: c.workDate,
      leaveDays: c.leaveDays ?? 0,
      status: c.status as "submitted" | "approved",
    })),
  );
  const showPaidLeaveBadge = grants.length > 0 || balance.usedPending > 0;

  const todayRecords = records.map((r) => ({
    id: r.id,
    type: r.type as "IN" | "OUT",
    timestamp: r.timestamp.toISOString(),
  }));

  const latestType = (records[0]?.type as "IN" | "OUT" | undefined) ?? null;
  const latestAt = records[0]?.timestamp.toISOString() ?? null;
  const serverNow = new Date().toISOString();

  const vehicleStatus = inProgressDriving
    ? {
        kind: "driving" as const,
        drivingLogId: inProgressDriving.id,
        vehicleId: inProgressDriving.vehicleId,
        plate: inProgressDriving.vehicle.plate,
        model: inProgressDriving.vehicle.model,
        purpose: inProgressDriving.purpose,
        workSiteName: inProgressDriving.workSiteName,
        startAt: inProgressDriving.startAt.toISOString(),
        startOdometer: inProgressDriving.startOdometer,
      }
    : null;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        {showPaidLeaveBadge && (
          <Link href="/attendance/paid-leave" className="paid-leave-badge">
            <span className="paid-leave-badge-label">年次有給</span>
            <span className="paid-leave-badge-value">残 {formatLeaveDays(balance.remaining)}</span>
            {balance.usedPending > 0 && (
              <span className="paid-leave-badge-sub">
                （申請中 {formatLeaveDays(balance.usedPending)}）
              </span>
            )}
            {balance.nextExpiry && (
              <span className="paid-leave-badge-sub">
                最短失効 {formatJSTYmd(balance.nextExpiry.expiresOn)}
              </span>
            )}
          </Link>
        )}
        <PunchPanel
          userName={session.name}
          latestType={latestType}
          latestAt={latestAt}
          todayRecords={todayRecords}
          serverNow={serverNow}
          isManager={false}
          vehicleStatus={vehicleStatus}
        />
      </main>
    </>
  );
}
