import type {
  DailyReport,
  DailyReportItem,
  DrivingLog,
  TimeRecord,
  User,
} from "@prisma/client";
import {
  combineDateAndTimeJST,
  formatJSTHHmm,
  parseYmdJST,
  startOfDateJST,
} from "./time";
import { buildSessions } from "./attendance";

export const REPORT_STATUSES = ["draft", "submitted", "acknowledged"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export function assertReportStatus(value: string): ReportStatus {
  if ((REPORT_STATUSES as readonly string[]).includes(value)) return value as ReportStatus;
  throw new Error(`invalid ReportStatus: ${value}`);
}

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済",
  acknowledged: "確認済",
};

export const ITEM_DESCRIPTION_MAX_CHARS = 80;
export const PROGRESS_NOTE_MAX_CHARS = 600;
export const ACK_COMMENT_MAX_CHARS = 200;
export const ITEMS_MAX_COUNT = 10;
export const WORK_SITE_MAX_CHARS = 50;

export type ValidationErrors = Record<string, string>;

export function codePointLength(s: string): number {
  return [...s].length;
}

export type UpsertReportItemInput = {
  orderIndex: number;
  startTime: string;
  endTime: string;
  description: string;
  workSiteName: string;
  workSiteId: string | null;
};

export type UpsertReportInput = {
  userId: string;
  reportDate: string;
  progressNote: string;
  items: UpsertReportItemInput[];
};

export type ValidatedReportItem = {
  orderIndex: number;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  description: string;
  workSiteName: string;
  workSiteId: string | null;
};

export type ValidatedUpsertReportInput = {
  userId: string;
  reportDate: Date;
  progressNote: string;
  items: ValidatedReportItem[];
  totalMinutes: number;
};

export function validateUpsertReportInput(
  input: UpsertReportInput,
): { ok: true; value: ValidatedUpsertReportInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  if (!input.userId || input.userId.trim().length === 0) {
    errors.userId = "申請者が指定されていません";
  }

  let reportDate: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate ?? "")) {
    errors.reportDate = "業務日の形式が不正です";
  } else {
    try {
      reportDate = parseYmdJST(input.reportDate);
    } catch {
      errors.reportDate = "業務日の形式が不正です";
    }
  }

  const progressNote = (input.progressNote ?? "").replace(/\r\n/g, "\n");
  if (codePointLength(progressNote) > PROGRESS_NOTE_MAX_CHARS) {
    errors.progressNote = `進捗・申し送りは${PROGRESS_NOTE_MAX_CHARS}文字以内です`;
  }

  if (!Array.isArray(input.items)) {
    errors.items = "作業アイテムが不正です";
  } else if (input.items.length > ITEMS_MAX_COUNT) {
    errors.items = `作業アイテムは${ITEMS_MAX_COUNT}件までです`;
  }

  const validatedItems: ValidatedReportItem[] = [];
  let totalMinutes = 0;

  if (reportDate && Array.isArray(input.items)) {
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const key = `items.${i}`;
      let startAt: Date | null = null;
      let endAt: Date | null = null;
      try {
        startAt = combineDateAndTimeJST(reportDate, it.startTime);
      } catch {
        errors[`${key}.startTime`] = "開始時刻の形式が不正です";
      }
      try {
        endAt = combineDateAndTimeJST(reportDate, it.endTime);
      } catch {
        errors[`${key}.endTime`] = "終了時刻の形式が不正です";
      }
      if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
        errors[`${key}.endTime`] = "終了時刻は開始時刻より後にしてください";
      }
      if (startAt && endAt) {
        const limit = reportDate.getTime() + 30 * 60 * 60 * 1000;
        if (endAt.getTime() > limit) {
          errors[`${key}.endTime`] = "終了時刻が業務日から離れすぎています";
        }
      }
      const description = (it.description ?? "").trim();
      if (description.length === 0) {
        errors[`${key}.description`] = "作業内容を入力してください";
      } else if (codePointLength(description) > ITEM_DESCRIPTION_MAX_CHARS) {
        errors[`${key}.description`] = `作業内容は${ITEM_DESCRIPTION_MAX_CHARS}文字以内です`;
      }
      const workSiteName = (it.workSiteName ?? "").trim().normalize("NFKC");
      if (workSiteName.length === 0) {
        errors[`${key}.workSiteName`] = "現場名を入力してください";
      } else if (codePointLength(workSiteName) > WORK_SITE_MAX_CHARS) {
        errors[`${key}.workSiteName`] = `現場名は${WORK_SITE_MAX_CHARS}文字以内です`;
      }
      if (startAt && endAt && !errors[`${key}.endTime`] && !errors[`${key}.description`] && !errors[`${key}.workSiteName`]) {
        const dur = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
        totalMinutes += dur;
        validatedItems.push({
          orderIndex: i,
          startAt,
          endAt,
          durationMinutes: dur,
          description,
          workSiteName,
          workSiteId: it.workSiteId?.trim() || null,
        });
      }
    }
  }

  if (Object.keys(errors).length > 0 || !reportDate) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      userId: input.userId.trim(),
      reportDate,
      progressNote,
      items: validatedItems,
      totalMinutes,
    },
  };
}

export type AckInput = { id: string; ackComment: string };
export type ValidatedAckInput = { id: string; ackComment: string | null };

export function validateAckInput(
  input: AckInput,
): { ok: true; value: ValidatedAckInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  if (!input.id || input.id.trim().length === 0) errors.id = "日報IDが指定されていません";
  const c = (input.ackComment ?? "").trim();
  if (codePointLength(c) > ACK_COMMENT_MAX_CHARS) {
    errors.ackComment = `コメントは${ACK_COMMENT_MAX_CHARS}文字以内です`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { id: input.id.trim(), ackComment: c.length === 0 ? null : c } };
}

// ===== 集計 =====

export type MonthlySiteWorkRow = {
  workSiteName: string;
  totalMinutes: number;
  reportCount: number;
};

export function buildMonthlyBySite(args: {
  items: DailyReportItem[];
}): MonthlySiteWorkRow[] {
  const map = new Map<string, { total: number; reports: Set<string> }>();
  for (const it of args.items) {
    const key = it.workSiteName || "（未入力）";
    if (!map.has(key)) map.set(key, { total: 0, reports: new Set() });
    const r = map.get(key)!;
    r.total += it.durationMinutes;
    r.reports.add(it.reportId);
  }
  return [...map.entries()]
    .map(([workSiteName, v]) => ({
      workSiteName,
      totalMinutes: v.total,
      reportCount: v.reports.size,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export type MonthlyUserWorkRow = {
  userId: string;
  userName: string;
  totalMinutes: number;
  reportedDays: number;
  submittedDays: number;
  acknowledgedDays: number;
};

export function buildMonthlyByUser(args: {
  users: User[];
  reports: DailyReport[];
}): MonthlyUserWorkRow[] {
  return args.users
    .map((u) => {
      const rs = args.reports.filter((r) => r.userId === u.id);
      return {
        userId: u.id,
        userName: u.name,
        totalMinutes: rs.reduce((acc, r) => acc + r.totalMinutes, 0),
        reportedDays: rs.length,
        submittedDays: rs.filter((r) => r.status === "submitted" || r.status === "acknowledged").length,
        acknowledgedDays: rs.filter((r) => r.status === "acknowledged").length,
      };
    })
    .filter((r) => r.reportedDays > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

// ===== プリフィル =====

export type DeriveReportItemDefault = {
  orderIndex: number;
  startTime: string;
  endTime: string;
  description: string;
  workSiteName: string;
  workSiteId: string | null;
};

export type DeriveReportDefaultsResult = {
  items: DeriveReportItemDefault[];
  warnings: string[];
};

export function deriveReportDefaults(args: {
  reportDate: Date;
  user: User;
  records: TimeRecord[];
  drivingLogs?: DrivingLog[];
}): DeriveReportDefaultsResult {
  const warnings: string[] = [];
  const dayStart = startOfDateJST(args.reportDate).getTime();
  const dayEnd = dayStart + 30 * 60 * 60 * 1000;

  // 走行ログ（completed）から作業アイテムを優先的に生成
  // 同日・自分の・帰着済みのみ
  const drivingItems: DeriveReportItemDefault[] = (args.drivingLogs ?? [])
    .filter((d) => d.userId === args.user.id && d.status === "completed" && d.endAt)
    .filter((d) => {
      const t = d.startAt.getTime();
      return t >= dayStart && t < dayEnd;
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((d, idx) => ({
      orderIndex: idx,
      startTime: formatJSTHHmm(d.startAt),
      endTime: d.endAt ? formatJSTHHmm(d.endAt) : "",
      description: d.purpose,
      workSiteName: d.workSiteName,
      workSiteId: d.workSiteId,
    }));

  if (drivingItems.length > 0) {
    return { items: drivingItems, warnings: ["from_driving"] };
  }

  // 走行ログ無し → 打刻セッションから雛形（時刻のみ）
  const dayRecords = args.records.filter((r) => {
    const t = r.timestamp.getTime();
    return t >= dayStart && t < dayEnd && r.userId === args.user.id;
  });
  const sessions = buildSessions([args.user], dayRecords);
  if (sessions.length === 0) {
    warnings.push("no_clock_in");
    return { items: [], warnings };
  }
  const items: DeriveReportItemDefault[] = sessions
    .filter((s) => s.endAt)
    .map((s, idx) => ({
      orderIndex: idx,
      startTime: formatJSTHHmm(s.startAt),
      endTime: s.endAt ? formatJSTHHmm(s.endAt) : "",
      description: "",
      workSiteName: "",
      workSiteId: null,
    }));
  if (sessions.some((s) => !s.endAt)) warnings.push("still_clocked_in");
  return { items, warnings };
}

// ===== 表示 =====

export function formatMinutesHm(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function formatMinutesJa(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}分`;
  if (m === 0) return `${sign}${h}時間`;
  return `${sign}${h}時間${m}分`;
}
