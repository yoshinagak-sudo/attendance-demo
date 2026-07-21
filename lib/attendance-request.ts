/**
 * 勤怠申請（休日出勤以外の 7 種）ドメインモデル。
 *
 * カテゴリ:
 *   absence          … 欠勤（日単位）
 *   late             … 遅刻（時刻: 実出勤 startAt / 予定出勤 scheduledAt）
 *   early_leave      … 早退（時刻: 実退勤 startAt / 予定退勤 scheduledAt）
 *   personal_out     … 私用外出（時間帯: startAt〜endAt）
 *   paid_leave       … 年次有給休暇（0.5 / 1.0 日、full / am_half / pm_half）
 *   special_leave    … 特別休暇（1.0 日 + reason 必須）
 *   substitute_leave … 振替休暇（1.0 日 + 元の holiday_work 承認済み申請と紐付け）
 *
 * 休日出勤は既存 OvertimeRequest.category="holiday_work" 側で管理する（SPEC §3.1.1）。
 */
import {
  REVIEW_COMMENT_MAX_CHARS,
  DESCRIPTION_MAX_CHARS,
  codePointLength,
  type RequestType,
  type ValidationErrors,
  assertRequestType,
  REQUEST_TYPE_LABEL,
} from "./overtime";
import { startOfDateJST, startOfTodayJST } from "./time";

export { REVIEW_COMMENT_MAX_CHARS, DESCRIPTION_MAX_CHARS, codePointLength };
export type { RequestType, ValidationErrors };
export { REQUEST_TYPE_LABEL };

// -----------------------------------------------------------------------------
// カテゴリ
// -----------------------------------------------------------------------------

export const ATTENDANCE_CATEGORIES = [
  "absence",
  "late",
  "early_leave",
  "personal_out",
  "paid_leave",
  "special_leave",
  "substitute_leave",
] as const;

export type AttendanceCategory = (typeof ATTENDANCE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<AttendanceCategory, string> = {
  absence: "欠勤",
  late: "遅刻",
  early_leave: "早退",
  personal_out: "私用外出",
  paid_leave: "年次有給休暇",
  special_leave: "特別休暇",
  substitute_leave: "振替休暇",
};

/** 単位区分。UI 描画と月次集計の判定に使う。 */
export type UnitKind = "day" | "time_range" | "time_point";

export const CATEGORY_UNIT: Record<AttendanceCategory, UnitKind> = {
  absence: "day",
  late: "time_point",
  early_leave: "time_point",
  personal_out: "time_range",
  paid_leave: "day",
  special_leave: "day",
  substitute_leave: "day",
};

export function assertAttendanceCategory(v: string): AttendanceCategory {
  if ((ATTENDANCE_CATEGORIES as readonly string[]).includes(v)) return v as AttendanceCategory;
  throw new Error(`invalid AttendanceCategory: ${v}`);
}

// -----------------------------------------------------------------------------
// ステータス（残業と共通）
// -----------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = ["submitted", "approved", "rejected", "sent_back"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  submitted: "申請中",
  approved: "承認済",
  rejected: "却下",
  sent_back: "差戻",
};

// -----------------------------------------------------------------------------
// 有給休暇の種別（全休 / 午前休 / 午後休）
// -----------------------------------------------------------------------------

export const PAID_LEAVE_KINDS = ["full", "am_half", "pm_half"] as const;
export type PaidLeaveKind = (typeof PAID_LEAVE_KINDS)[number];

export const PAID_LEAVE_KIND_LABEL: Record<PaidLeaveKind, string> = {
  full: "全休",
  am_half: "午前半休",
  pm_half: "午後半休",
};

export function daysForPaidLeaveKind(kind: PaidLeaveKind): number {
  return kind === "full" ? 1.0 : 0.5;
}

// -----------------------------------------------------------------------------
// 特別休暇 理由サジェスト
// -----------------------------------------------------------------------------

export const REASON_MAX_CHARS = 200;
export const DEFAULT_SPECIAL_LEAVE_REASONS = [
  "慶弔",
  "結婚",
  "忌引",
  "災害",
  "裁判員",
  "健診",
  "その他",
];

// -----------------------------------------------------------------------------
// 事前/事後の許容日数（AppSetting.attendance_post_days_allowed から上書き可）
// -----------------------------------------------------------------------------

export const DEFAULT_POST_DAYS_ALLOWED: Record<AttendanceCategory, number> = {
  absence: 1,
  late: 0,
  early_leave: 0,
  personal_out: 0,
  paid_leave: 0, // 実質不可（manager が個別許可する運用）
  special_leave: 1,
  substitute_leave: 90,
};

/** 振替休暇の元 holiday_work をこの日数以内で選ばせる。 */
export const SUBSTITUTE_PICK_WINDOW_DAYS = 90;

// -----------------------------------------------------------------------------
// 入力 → 検証済み値
// -----------------------------------------------------------------------------

export type CreateAttendanceInput = {
  userId: string;
  category: string;
  requestType: string;
  workDate: string;
  description: string;

  startAt?: string;
  endAt?: string;
  scheduledAt?: string;
  paidLeaveKind?: string;
  reason?: string;
  substituteForId?: string;
};

export type ValidatedCreateAttendance = {
  userId: string;
  category: AttendanceCategory;
  requestType: RequestType;
  workDate: Date;
  description: string;

  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number | null;

  leaveDays: number | null;
  paidLeaveKind: PaidLeaveKind | null;
  scheduledAt: Date | null;
  reason: string | null;
  substituteForId: string | null;
};

function tryParseDate(v: string | undefined | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isYmd(v: string | undefined | null): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * カテゴリ別の入力を検証する。
 * - workDate は必須（JST 0:00 に丸める）
 * - 事前/事後の日付制約は categoryPostAllowedDays（AppSetting 由来）で上書き可
 */
export function validateCreateAttendance(
  input: CreateAttendanceInput,
  opts: {
    categoryPostAllowedDays?: Partial<Record<AttendanceCategory, number>>;
    now?: Date;
    isManager?: boolean;
  } = {},
): { ok: true; value: ValidatedCreateAttendance } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  const today = startOfTodayJST();

  if (!input.userId || input.userId.trim().length === 0) {
    errors.userId = "申請者を選択してください";
  }

  let category: AttendanceCategory | null = null;
  try {
    category = assertAttendanceCategory(input.category);
  } catch {
    errors.category = "カテゴリが不正です";
  }

  let requestType: RequestType | null = null;
  try {
    requestType = assertRequestType(input.requestType);
  } catch {
    errors.requestType = "申請種別が不正です";
  }

  let workDate: Date | null = null;
  if (!isYmd(input.workDate)) {
    errors.workDate = "対象日の形式が不正です";
  } else {
    try {
      workDate = startOfDateJST(new Date(`${input.workDate}T00:00:00+09:00`));
    } catch {
      errors.workDate = "対象日の形式が不正です";
    }
  }

  const description = input.description ?? "";
  if (codePointLength(description) > DESCRIPTION_MAX_CHARS) {
    errors.description = `補足は${DESCRIPTION_MAX_CHARS}文字以内です`;
  }

  if (workDate && requestType) {
    if (requestType === "pre") {
      if (workDate.getTime() < today.getTime()) {
        errors.requestType = "事前申請は今日以降の日付を選んでください";
      }
    } else if (requestType === "post" && category) {
      if (workDate.getTime() > today.getTime()) {
        errors.requestType = "事後申請に未来日は使えません";
      } else {
        const allow =
          opts.categoryPostAllowedDays?.[category] ?? DEFAULT_POST_DAYS_ALLOWED[category];
        const earliestPost = today.getTime() - allow * 24 * 60 * 60 * 1000;
        if (workDate.getTime() < earliestPost) {
          if (allow === 0) {
            errors.requestType = "事後申請は当日中のみ受け付けます";
          } else {
            errors.requestType = `事後申請は${allow}日前までしか遡れません`;
          }
        }
        if (category === "paid_leave" && !opts.isManager) {
          errors.requestType = "年次有給の事後申請は管理者にご連絡ください";
        }
      }
    }
  }

  let startAt: Date | null = null;
  let endAt: Date | null = null;
  let durationMinutes: number | null = null;
  let leaveDays: number | null = null;
  let paidLeaveKind: PaidLeaveKind | null = null;
  let scheduledAt: Date | null = null;
  let reason: string | null = null;
  let substituteForId: string | null = null;

  if (category) {
    switch (category) {
      case "absence": {
        leaveDays = 1.0;
        break;
      }
      case "late":
      case "early_leave": {
        startAt = tryParseDate(input.startAt);
        scheduledAt = tryParseDate(input.scheduledAt);
        if (!startAt) errors.startAt = "実際の時刻を入力してください";
        if (!scheduledAt) errors.scheduledAt = "予定の時刻を入力してください";
        if (startAt && scheduledAt) {
          const diff =
            category === "late"
              ? startAt.getTime() - scheduledAt.getTime()
              : scheduledAt.getTime() - startAt.getTime();
          if (diff <= 0) {
            errors.startAt =
              category === "late"
                ? "実出勤時刻は予定より後にしてください"
                : "実退勤時刻は予定より前にしてください";
          } else {
            durationMinutes = Math.round(diff / 60000);
          }
          endAt = scheduledAt;
        }
        break;
      }
      case "personal_out": {
        startAt = tryParseDate(input.startAt);
        endAt = tryParseDate(input.endAt);
        if (!startAt) errors.startAt = "開始時刻を入力してください";
        if (!endAt) errors.endAt = "終了時刻を入力してください";
        if (startAt && endAt) {
          if (endAt.getTime() <= startAt.getTime()) {
            errors.endAt = "終了時刻は開始時刻より後にしてください";
          } else {
            durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
          }
        }
        break;
      }
      case "paid_leave": {
        const rawKind = input.paidLeaveKind ?? "";
        if (!(PAID_LEAVE_KINDS as readonly string[]).includes(rawKind)) {
          errors.paidLeaveKind = "有給の種別（全休/午前休/午後休）を選んでください";
        } else {
          paidLeaveKind = rawKind as PaidLeaveKind;
          leaveDays = daysForPaidLeaveKind(paidLeaveKind);
        }
        break;
      }
      case "special_leave": {
        leaveDays = 1.0;
        const raw = (input.reason ?? "").trim();
        if (raw.length === 0) {
          errors.reason = "理由（種別）を入力してください";
        } else if (codePointLength(raw) > REASON_MAX_CHARS) {
          errors.reason = `理由は${REASON_MAX_CHARS}文字以内です`;
        } else {
          reason = raw;
        }
        break;
      }
      case "substitute_leave": {
        leaveDays = 1.0;
        const sid = (input.substituteForId ?? "").trim();
        if (sid.length === 0) {
          errors.substituteForId = "元の休日出勤を選んでください";
        } else {
          substituteForId = sid;
        }
        break;
      }
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !category ||
    !requestType ||
    !workDate
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      userId: input.userId.trim(),
      category,
      requestType,
      workDate,
      description,
      startAt,
      endAt,
      durationMinutes,
      leaveDays,
      paidLeaveKind,
      scheduledAt,
      reason,
      substituteForId,
    },
  };
}

// -----------------------------------------------------------------------------
// 便利フォーマッタ
// -----------------------------------------------------------------------------

export function formatLeaveDays(days: number | null | undefined): string {
  if (days == null) return "-";
  return days === Math.floor(days) ? `${days}日` : `${days.toFixed(1)}日`;
}

/**
 * "absence:1,late:0,..." 形式を Partial<Record<AttendanceCategory, number>> に落とす。
 * 未知カテゴリや数値以外は無視。
 */
export function parseCategoryPostAllowedDays(
  raw: string | null | undefined,
): Partial<Record<AttendanceCategory, number>> {
  if (!raw) return {};
  const result: Partial<Record<AttendanceCategory, number>> = {};
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split(":").map((s) => s.trim());
    if (!k || !v) continue;
    if (!(ATTENDANCE_CATEGORIES as readonly string[]).includes(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    result[k as AttendanceCategory] = Math.floor(n);
  }
  return result;
}
