import type { OvertimeRequest, TimeRecord, User } from "@prisma/client";
import { buildSessions } from "./attendance";
import { formatJSTYmd } from "./time";

const REGULAR_DAILY_MINUTES = 8 * 60;

export type MonthlyOvertimeRow = {
  userId: string;
  userName: string;
  workedMinutes: number;
  workedDays: number;
  approvedOvertimeMinutes: number;
  pendingOvertimeMinutes: number;
  rejectedOvertimeMinutes: number;
  diffMinutes: number;
};

type AggregateInput = {
  users: User[];
  records: TimeRecord[];
  requests: Pick<OvertimeRequest, "userId" | "status" | "durationMinutes">[];
  monthStart: Date;
  monthEnd: Date;
  now?: Date;
};

export function buildMonthlyOvertimeRows(input: AggregateInput): MonthlyOvertimeRow[] {
  const { users, records, requests, monthStart, monthEnd } = input;
  const now = input.now ?? new Date();

  const inMonthRecords = records.filter((r) => {
    const t = r.timestamp.getTime();
    return t >= monthStart.getTime() && t < monthEnd.getTime();
  });
  const sessions = buildSessions(users, inMonthRecords, now);

  const workedByUser = new Map<string, { minutes: number; days: Set<string> }>();
  for (const u of users) workedByUser.set(u.id, { minutes: 0, days: new Set() });
  for (const s of sessions) {
    const bucket = workedByUser.get(s.userId);
    if (!bucket) continue;
    bucket.minutes += s.durationMinutes;
    bucket.days.add(formatJSTYmd(s.startAt));
  }

  const otByUser = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const u of users) otByUser.set(u.id, { approved: 0, pending: 0, rejected: 0 });
  for (const r of requests) {
    const bucket = otByUser.get(r.userId);
    if (!bucket) continue;
    if (r.status === "approved") bucket.approved += r.durationMinutes;
    else if (r.status === "submitted" || r.status === "sent_back") bucket.pending += r.durationMinutes;
    else if (r.status === "rejected") bucket.rejected += r.durationMinutes;
  }

  const rows: MonthlyOvertimeRow[] = [];
  for (const u of users) {
    const w = workedByUser.get(u.id) ?? { minutes: 0, days: new Set<string>() };
    const o = otByUser.get(u.id) ?? { approved: 0, pending: 0, rejected: 0 };
    const expectedRegular = w.days.size * REGULAR_DAILY_MINUTES;
    const diff = w.minutes - expectedRegular - o.approved;
    rows.push({
      userId: u.id,
      userName: u.name,
      workedMinutes: w.minutes,
      workedDays: w.days.size,
      approvedOvertimeMinutes: o.approved,
      pendingOvertimeMinutes: o.pending,
      rejectedOvertimeMinutes: o.rejected,
      diffMinutes: diff,
    });
  }

  rows.sort((a, b) => b.approvedOvertimeMinutes - a.approvedOvertimeMinutes);
  return rows;
}

export type MonthlyTotals = {
  approvedOvertimeMinutes: number;
  pendingOvertimeMinutes: number;
  rejectedOvertimeMinutes: number;
  workedMinutes: number;
  diffPositiveCount: number;
};

export function buildMonthlyTotals(rows: MonthlyOvertimeRow[]): MonthlyTotals {
  return rows.reduce<MonthlyTotals>(
    (acc, r) => ({
      approvedOvertimeMinutes: acc.approvedOvertimeMinutes + r.approvedOvertimeMinutes,
      pendingOvertimeMinutes: acc.pendingOvertimeMinutes + r.pendingOvertimeMinutes,
      rejectedOvertimeMinutes: acc.rejectedOvertimeMinutes + r.rejectedOvertimeMinutes,
      workedMinutes: acc.workedMinutes + r.workedMinutes,
      diffPositiveCount: acc.diffPositiveCount + (r.diffMinutes > 0 ? 1 : 0),
    }),
    {
      approvedOvertimeMinutes: 0,
      pendingOvertimeMinutes: 0,
      rejectedOvertimeMinutes: 0,
      workedMinutes: 0,
      diffPositiveCount: 0,
    },
  );
}
