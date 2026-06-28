/**
 * 管理ダッシュボード用データ集計
 */
import { prisma } from "@/lib/prisma";
import { startOfTodayJST } from "@/lib/time";
import { buildDailyStats } from "@/lib/attendance";
import { allVehicleAlertsWithin } from "@/lib/vehicle";

/** 今日の出勤状況サマリ */
export async function getTodayOverview() {
  const since = startOfTodayJST();
  const [users, records] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeRecord.findMany({
      where: { timestamp: { gte: since } },
      include: { user: true },
      orderBy: { timestamp: "asc" },
    }),
  ]);
  const daily = buildDailyStats(users, records);
  return {
    totalActive: users.length,
    working: daily.workingNow,
    finished: daily.clockedOut,
    notYet: daily.notYetIn,
    totalWorkMinutes: daily.totalMinutes,
    sessions: daily.sessions,
  };
}

/** 月次集計（今月）: 社員ごとに勤務時間/残業時間/勤務日数 */
export async function getMonthlyAggregate(): Promise<{
  yearMonth: string;
  rows: {
    userId: string;
    userName: string;
    workDays: number;
    workMinutes: number;
    overtimeMinutes: number;
  }[];
}> {
  const now = new Date();
  // 月初〜来月初を JST 基準で算出
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yearMonth = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 1) -
      9 * 60 * 60 * 1000,
  );
  const monthEnd = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1, 1) -
      9 * 60 * 60 * 1000,
  );

  const [users, records, overtime] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeRecord.findMany({
      where: { timestamp: { gte: monthStart, lt: monthEnd } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.overtimeRequest.findMany({
      where: {
        workDate: { gte: monthStart, lt: monthEnd },
        status: "approved",
      },
    }),
  ]);

  // 日付ごとの IN/OUT ペアを社員別に集計
  type Pair = { in?: Date; out?: Date };
  const perUser = new Map<string, Map<string, Pair>>();
  for (const r of records) {
    if (!perUser.has(r.userId)) perUser.set(r.userId, new Map());
    const dayKey = ymdJST(r.timestamp);
    const dayMap = perUser.get(r.userId)!;
    const pair = dayMap.get(dayKey) ?? {};
    if (r.type === "IN" && !pair.in) pair.in = r.timestamp;
    if (r.type === "OUT") pair.out = r.timestamp;
    dayMap.set(dayKey, pair);
  }

  // 残業時間（承認済み）を社員別に合算
  const otByUser = new Map<string, number>();
  for (const o of overtime) {
    otByUser.set(o.userId, (otByUser.get(o.userId) ?? 0) + o.durationMinutes);
  }

  const rows = users.map((u) => {
    const dayMap = perUser.get(u.id);
    let workDays = 0;
    let workMinutes = 0;
    if (dayMap) {
      for (const [, p] of dayMap) {
        if (p.in && p.out && p.out > p.in) {
          workDays += 1;
          workMinutes += Math.floor((p.out.getTime() - p.in.getTime()) / 60000);
        }
      }
    }
    return {
      userId: u.id,
      userName: u.name,
      workDays,
      workMinutes,
      overtimeMinutes: otByUser.get(u.id) ?? 0,
    };
  });

  return { yearMonth, rows };
}

function ymdJST(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`;
}

/** 車両状況: 使用中・車検期限警告・走行/燃費サマリ */
export async function getVehicleStatus() {
  const [vehicles, assignments, driving] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: { plate: "asc" },
    }),
    prisma.vehicleAssignment.findMany({
      where: { releasedAt: null },
      include: { user: { select: { name: true } } },
    }),
    prisma.drivingLog.findMany({
      orderBy: { startAt: "desc" },
      take: 200,
    }),
  ]);

  const alerts = allVehicleAlertsWithin({ vehicles, windowDays: 30 });

  // 直近の走行距離合算（過去30日）
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentDriving = driving.filter((d) => d.startAt && d.startAt >= since);
  const totalKmByVehicle = new Map<string, number>();
  for (const d of recentDriving) {
    if (d.distanceKm != null && d.distanceKm > 0) {
      totalKmByVehicle.set(
        d.vehicleId,
        (totalKmByVehicle.get(d.vehicleId) ?? 0) + d.distanceKm,
      );
    } else if (d.startOdometer != null && d.endOdometer != null) {
      const km = d.endOdometer - d.startOdometer;
      if (km > 0)
        totalKmByVehicle.set(
          d.vehicleId,
          (totalKmByVehicle.get(d.vehicleId) ?? 0) + km,
        );
    }
  }

  return {
    total: vehicles.length,
    inUse: assignments.length,
    alerts: alerts.length,
    vehicles: vehicles.map((v) => {
      const assign = assignments.find((a) => a.vehicleId === v.id);
      return {
        id: v.id,
        plate: v.plate,
        model: v.model,
        depot: v.depot ?? "",
        inspectionDueDate: v.vehicleInspectionDueDate,
        assignedUserName: assign?.user?.name ?? null,
        recentKm: totalKmByVehicle.get(v.id) ?? 0,
      };
    }),
  };
}

/** 未対応件数: 残業申請（submitted）と未確認日報 */
export async function getPendingCounts() {
  const [overtime, reports] = await Promise.all([
    prisma.overtimeRequest.count({ where: { status: "submitted" } }),
    prisma.dailyReport.count({ where: { acknowledgedAt: null } }),
  ]);
  return { pendingOvertime: overtime, pendingReports: reports };
}
