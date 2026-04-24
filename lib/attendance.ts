import type { TimeRecord, User } from "@prisma/client";

export type Session = {
  userId: string;
  userName: string;
  startAt: Date;
  endAt: Date | null;
  durationMinutes: number;
};

export type DailyStats = {
  workingNow: number;
  clockedOut: number;
  notYetIn: number;
  totalMinutes: number;
  sessions: Session[];
};

export function buildSessions(
  users: User[],
  records: (TimeRecord & { user?: User })[],
  now: Date = new Date(),
): Session[] {
  const userMap = new Map(users.map((u) => [u.id, u]));
  const byUser = new Map<string, TimeRecord[]>();
  for (const r of records) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  const sessions: Session[] = [];
  for (const [userId, list] of byUser.entries()) {
    const u = userMap.get(userId);
    if (!u) continue;
    const sorted = [...list].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    let currentIn: Date | null = null;
    for (const r of sorted) {
      if (r.type === "IN") {
        if (currentIn) {
          sessions.push({
            userId,
            userName: u.name,
            startAt: currentIn,
            endAt: r.timestamp,
            durationMinutes: Math.round(
              (r.timestamp.getTime() - currentIn.getTime()) / 60000,
            ),
          });
        }
        currentIn = r.timestamp;
      } else if (r.type === "OUT" && currentIn) {
        sessions.push({
          userId,
          userName: u.name,
          startAt: currentIn,
          endAt: r.timestamp,
          durationMinutes: Math.round(
            (r.timestamp.getTime() - currentIn.getTime()) / 60000,
          ),
        });
        currentIn = null;
      }
    }
    if (currentIn) {
      sessions.push({
        userId,
        userName: u.name,
        startAt: currentIn,
        endAt: null,
        durationMinutes: Math.round(
          (now.getTime() - currentIn.getTime()) / 60000,
        ),
      });
    }
  }
  return sessions;
}

export function buildDailyStats(
  users: User[],
  records: (TimeRecord & { user?: User })[],
  now: Date = new Date(),
): DailyStats {
  const sessions = buildSessions(users, records, now);

  const userStatus = new Map<string, "IN" | "OUT" | "NONE">();
  for (const u of users) userStatus.set(u.id, "NONE");
  for (const s of sessions) {
    userStatus.set(s.userId, s.endAt === null ? "IN" : "OUT");
  }

  let workingNow = 0;
  let clockedOut = 0;
  let notYetIn = 0;
  for (const status of userStatus.values()) {
    if (status === "IN") workingNow++;
    else if (status === "OUT") clockedOut++;
    else notYetIn++;
  }

  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  return { workingNow, clockedOut, notYetIn, totalMinutes, sessions };
}

export function generateAiSummary(stats: DailyStats, now: Date = new Date()): string {
  const hours = (stats.totalMinutes / 60).toFixed(1);
  const hour = now.getHours();
  const timeLabel = hour < 12 ? "午前" : hour < 17 ? "午後" : "夕方";

  const parts: string[] = [];

  if (stats.workingNow > 0) {
    parts.push(`${timeLabel}現在、${stats.workingNow}名が出勤中`);
  } else if (stats.clockedOut > 0) {
    parts.push(`本日の出勤者は全員退勤済み`);
  } else {
    parts.push(`本日はまだ打刻がありません`);
  }

  if (stats.clockedOut > 0) {
    parts.push(`退勤済み${stats.clockedOut}名`);
  }
  if (stats.totalMinutes > 0) {
    parts.push(`合計労働時間${hours}時間`);
  }

  // 10時間以上勤務しているセッションがあれば注意喚起
  const longSession = stats.sessions.find((s) => s.durationMinutes / 60 >= 10);
  let tail = "";
  if (longSession) {
    const h = (longSession.durationMinutes / 60).toFixed(1);
    tail = longSession.endAt === null
      ? `${longSession.userName}さんが${h}時間連続で出勤中。退勤打刻忘れの可能性があります。`
      : `${longSession.userName}さんが${h}時間勤務。長時間労働に注意してください。`;
  } else if (stats.workingNow > 0 || stats.clockedOut > 0) {
    tail = "特に異常はありません。順調です。";
  }

  return `${parts.join("、")}。${tail}`.trim();
}
