import type { OvertimeRequest, TimeRecord } from "@prisma/client";
import {
  combineDateAndTimeJST,
  formatJSTYmd,
  startOfDateJST,
  startOfTodayJST,
} from "./time";

export const OVERTIME_STATUSES = ["submitted", "approved", "rejected", "sent_back"] as const;
export type OvertimeStatus = (typeof OVERTIME_STATUSES)[number];

export const REQUEST_TYPES = ["pre", "post"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const STATUS_LABEL: Record<OvertimeStatus, string> = {
  submitted: "申請中",
  approved: "承認済",
  rejected: "却下",
  sent_back: "差戻",
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  pre: "事前",
  post: "事後",
};

export function assertOvertimeStatus(value: string): OvertimeStatus {
  if ((OVERTIME_STATUSES as readonly string[]).includes(value)) return value as OvertimeStatus;
  throw new Error(`invalid OvertimeStatus: ${value}`);
}

export function assertRequestType(value: string): RequestType {
  if ((REQUEST_TYPES as readonly string[]).includes(value)) return value as RequestType;
  throw new Error(`invalid RequestType: ${value}`);
}

export const DESCRIPTION_MAX_CHARS = 200;
export const WORK_SITE_MAX_CHARS = 50;
export const REVIEW_COMMENT_MAX_CHARS = 200;

export function codePointLength(s: string): number {
  return [...s].length;
}

export type ValidationErrors = Record<string, string>;

export type CreateOvertimeInput = {
  userId: string;
  workDate: string;
  startAt: string;
  endAt: string;
  workSiteName: string;
  workSiteId: string | null;
  description: string;
  requestType: string;
};

export type ValidatedCreateOvertimeInput = {
  userId: string;
  workDate: Date;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  workSiteName: string;
  workSiteId: string | null;
  description: string;
  requestType: RequestType;
};

export function validateCreateOvertimeInput(
  input: CreateOvertimeInput,
  now: Date = new Date(),
): { ok: true; value: ValidatedCreateOvertimeInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};

  if (!input.userId || input.userId.trim().length === 0) {
    errors.userId = "申請者を選択してください";
  }

  let workDate: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate ?? "")) {
    errors.workDate = "申請日の形式が不正です";
  } else {
    try {
      workDate = startOfDateJST(new Date(`${input.workDate}T00:00:00+09:00`));
    } catch {
      errors.workDate = "申請日の形式が不正です";
    }
  }

  let startAt: Date | null = null;
  let endAt: Date | null = null;
  try {
    startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) startAt = null;
  } catch {
    startAt = null;
  }
  try {
    endAt = new Date(input.endAt);
    if (Number.isNaN(endAt.getTime())) endAt = null;
  } catch {
    endAt = null;
  }
  if (!startAt) errors.startAt = "開始時刻が不正です";
  if (!endAt) errors.endAt = "終了時刻が不正です";

  if (startAt && endAt) {
    if (endAt.getTime() <= startAt.getTime()) {
      errors.endAt = "終了時刻は開始時刻より後にしてください";
    }
    if (workDate) {
      const limit = workDate.getTime() + 30 * 60 * 60 * 1000;
      if (endAt.getTime() > limit) {
        errors.endAt = "終了時刻が業務日から離れすぎています";
      }
    }
  }

  const workSiteName = (input.workSiteName ?? "").trim().normalize("NFKC");
  if (workSiteName.length === 0) {
    errors.workSiteName = "現場名を入力してください";
  } else if (codePointLength(workSiteName) > WORK_SITE_MAX_CHARS) {
    errors.workSiteName = `現場名は${WORK_SITE_MAX_CHARS}文字以内です`;
  }

  const description = input.description ?? "";
  if (description.trim().length === 0) {
    errors.description = "作業内容を入力してください";
  } else if (codePointLength(description) > DESCRIPTION_MAX_CHARS) {
    errors.description = `作業内容は${DESCRIPTION_MAX_CHARS}文字以内です`;
  }

  let requestType: RequestType | null = null;
  try {
    requestType = assertRequestType(input.requestType);
  } catch {
    errors.requestType = "申請種別が不正です";
  }

  if (requestType === "post" && workDate) {
    const today = startOfTodayJST();
    if (workDate.getTime() < today.getTime()) {
      errors.requestType = "事後申請は当日中のみ受け付けます";
    }
    if (workDate.getTime() > today.getTime()) {
      errors.requestType = "事後申請は未来日には使えません";
    }
  }

  if (requestType === "pre" && startAt) {
    if (startAt.getTime() < now.getTime() - 5 * 60 * 1000) {
      errors.requestType = "事前申請は開始時刻が現在より後である必要があります";
    }
  }

  if (Object.keys(errors).length > 0 || !workDate || !startAt || !endAt || !requestType) {
    return { ok: false, errors };
  }

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

  return {
    ok: true,
    value: {
      userId: input.userId.trim(),
      workDate,
      startAt,
      endAt,
      durationMinutes,
      workSiteName,
      workSiteId: input.workSiteId?.trim() || null,
      description,
      requestType,
    },
  };
}

export type DeriveDefaultsResult = {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  warnings: string[];
};

export function deriveDefaults(args: {
  workDate: Date;
  regularEndTime: string;
  records: TimeRecord[];
  now?: Date;
}): DeriveDefaultsResult {
  const now = args.now ?? new Date();
  const warnings: string[] = [];

  const dayStart = startOfDateJST(args.workDate).getTime();
  const dayEnd = dayStart + 30 * 60 * 60 * 1000;
  const sameDayOuts = args.records
    .filter((r) => r.type === "OUT")
    .filter((r) => {
      const t = r.timestamp.getTime();
      return t >= dayStart && t < dayEnd;
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const regularEnd = combineDateAndTimeJST(args.workDate, args.regularEndTime);
  let startAt = regularEnd;
  let endAt: Date;

  if (sameDayOuts.length === 0) {
    endAt = new Date(Math.max(now.getTime(), startAt.getTime() + 60 * 60 * 1000));
    warnings.push("no_clock_out");
  } else if (sameDayOuts.length === 1) {
    endAt = sameDayOuts[0].timestamp;
  } else {
    endAt = sameDayOuts[sameDayOuts.length - 1].timestamp;
    warnings.push("multiple_clock_outs");
  }

  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    warnings.push("end_before_start_fallback");
  }

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMinutes > 12 * 60) warnings.push("over_12h");

  return { startAt, endAt, durationMinutes, warnings };
}

export function detectOverlap(
  candidate: { startAt: Date; endAt: Date },
  existing: Pick<OvertimeRequest, "id" | "startAt" | "endAt" | "status">[],
): string[] {
  const cs = candidate.startAt.getTime();
  const ce = candidate.endAt.getTime();
  const conflicts: string[] = [];
  for (const r of existing) {
    if (r.status === "rejected") continue;
    const rs = r.startAt.getTime();
    const re = r.endAt.getTime();
    if (cs < re && ce > rs) conflicts.push(r.id);
  }
  return conflicts;
}

export function isSameJSTDay(a: Date, b: Date): boolean {
  return formatJSTYmd(a) === formatJSTYmd(b);
}

export function formatDuration(durationMinutes: number): string {
  const sign = durationMinutes < 0 ? "-" : "";
  const abs = Math.abs(durationMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function formatDurationJa(durationMinutes: number): string {
  const sign = durationMinutes < 0 ? "-" : "";
  const abs = Math.abs(durationMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}分`;
  if (m === 0) return `${sign}${h}時間`;
  return `${sign}${h}時間${m}分`;
}
