"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, isAdminRole } from "@/lib/session";
import { requireAdminOrDashboard, adminPrefix } from "@/lib/auth-guard";
import {
  REVIEW_COMMENT_MAX_CHARS,
  codePointLength,
  validateCreateAttendance,
  parseCategoryPostAllowedDays,
  type CreateAttendanceInput,
  type ValidationErrors,
  type AttendanceCategory,
} from "@/lib/attendance-request";
import {
  computePaidLeaveBalance,
  canConsume,
  expirationOf,
  scheduledGrantDates,
} from "@/lib/paid-leave";
import { startOfDateJST } from "@/lib/time";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

// -----------------------------------------------------------------------------
// AppSetting 由来のカテゴリ別 post 許容日数を読む
// -----------------------------------------------------------------------------

async function loadCategoryPostAllowedDays(): Promise<
  Partial<Record<AttendanceCategory, number>>
> {
  const s = await prisma.appSetting.findUnique({
    where: { key: "attendance_post_days_allowed" },
  });
  return parseCategoryPostAllowedDays(s?.value);
}

// -----------------------------------------------------------------------------
// 申請作成
// -----------------------------------------------------------------------------

async function persistCreate(
  input: CreateAttendanceInput,
  parentId: string | null,
  actor: { userId: string; isManager: boolean },
): Promise<ActionResult> {
  const postAllowed = await loadCategoryPostAllowedDays();
  const validated = validateCreateAttendance(input, {
    categoryPostAllowedDays: postAllowed,
    isManager: actor.isManager,
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  // paid_leave の残日数チェック（トランザクション内で再確認）
  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    if (v.category === "paid_leave") {
      const grants = await tx.paidLeaveGrant.findMany({
        where: { userId: v.userId },
      });
      const cons = await tx.attendanceRequest.findMany({
        where: {
          userId: v.userId,
          category: "paid_leave",
          status: { in: ["submitted", "approved"] },
        },
        select: { id: true, workDate: true, leaveDays: true, status: true },
      });
      const balance = computePaidLeaveBalance(
        grants.map((g) => ({
          id: g.id,
          grantedOn: g.grantedOn,
          expiresOn: g.expiresOn,
          days: g.days,
        })),
        cons.map((c) => ({
          id: c.id,
          workDate: c.workDate,
          leaveDays: c.leaveDays ?? 0,
          status: c.status as "submitted" | "approved",
        })),
        now,
      );
      const check = canConsume(balance, v.leaveDays ?? 0);
      if (!check.ok) {
        throw new Error(`SHORT:${check.shortBy}`);
      }
    }

    // substitute_leave: substituteForId の approved holiday_work が実在するか確認
    if (v.category === "substitute_leave" && v.substituteForId) {
      const src = await tx.overtimeRequest.findFirst({
        where: {
          id: v.substituteForId,
          userId: v.userId,
          category: "holiday_work",
          status: "approved",
        },
        select: { id: true },
      });
      if (!src) {
        throw new Error("NO_SUBSTITUTE_SOURCE");
      }
      // 同じ元 holiday_work に対する submitted/approved の substitute_leave が既にあれば禁止
      const dup = await tx.attendanceRequest.findFirst({
        where: {
          substituteForId: v.substituteForId,
          category: "substitute_leave",
          status: { in: ["submitted", "approved"] },
        },
        select: { id: true },
      });
      if (dup) {
        throw new Error("SUBSTITUTE_ALREADY_TAKEN");
      }
    }

    return tx.attendanceRequest.create({
      data: {
        userId: v.userId,
        category: v.category,
        requestType: v.requestType,
        status: "submitted",
        workDate: v.workDate,
        startAt: v.startAt,
        endAt: v.endAt,
        durationMinutes: v.durationMinutes,
        leaveDays: v.leaveDays,
        paidLeaveKind: v.paidLeaveKind,
        scheduledAt: v.scheduledAt,
        reason: v.reason,
        substituteForId: v.substituteForId,
        description: v.description,
        parentId,
      },
    });
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("SHORT:")) {
      const shortBy = parseFloat(msg.slice(6));
      return {
        errors: {
          paidLeaveKind: `残日数が ${shortBy.toFixed(1)} 日不足しています`,
        } as ValidationErrors,
      };
    }
    if (msg === "NO_SUBSTITUTE_SOURCE") {
      return {
        errors: {
          substituteForId: "選ばれた休日出勤は承認済みで存在しません",
        } as ValidationErrors,
      };
    }
    if (msg === "SUBSTITUTE_ALREADY_TAKEN") {
      return {
        errors: {
          substituteForId: "この休日出勤にはすでに振替休暇が紐付いています",
        } as ValidationErrors,
      };
    }
    throw e;
  });

  if ("errors" in created) {
    return { ok: false, errors: created.errors };
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/paid-leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/admin");
  revalidatePath("/");

  return { ok: true, id: created.id };
}

function readCreateInput(formData: FormData, userId: string): CreateAttendanceInput {
  return {
    userId,
    category: String(formData.get("category") ?? ""),
    requestType: String(formData.get("requestType") ?? ""),
    workDate: String(formData.get("workDate") ?? ""),
    description: String(formData.get("description") ?? ""),
    startAt: (formData.get("startAt") as string) || undefined,
    endAt: (formData.get("endAt") as string) || undefined,
    scheduledAt: (formData.get("scheduledAt") as string) || undefined,
    paidLeaveKind: (formData.get("paidLeaveKind") as string) || undefined,
    reason: (formData.get("reason") as string) || undefined,
    substituteForId: (formData.get("substituteForId") as string) || undefined,
  };
}

export async function createAttendanceRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, errors: {}, formError: "ログインしてください" };
  }
  const input = readCreateInput(formData, session.id);
  const result = await persistCreate(input, null, {
    userId: session.id,
    isManager: isAdminRole(session.role),
  });
  if (result.ok) {
    redirect(`/attendance/${result.id}?submitted=1`);
  }
  return result;
}

export async function createAttendanceResubmission(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, errors: {}, formError: "ログインしてください" };
  }
  const parentId = String(formData.get("parentId") ?? "");
  if (!parentId) return { ok: false, errors: {}, formError: "再申請対象が見つかりません" };

  const parent = await prisma.attendanceRequest.findUnique({ where: { id: parentId } });
  if (!parent) return { ok: false, errors: {}, formError: "元の申請が見つかりません" };
  if (parent.userId !== session.id) {
    return { ok: false, errors: {}, formError: "他人の申請は再申請できません" };
  }
  if (parent.status !== "sent_back") {
    return { ok: false, errors: {}, formError: "差戻状態の申請のみ再申請できます" };
  }

  const input = readCreateInput(formData, session.id);
  const result = await persistCreate(input, parent.id, {
    userId: session.id,
    isManager: isAdminRole(session.role),
  });
  if (result.ok) {
    redirect(`/attendance/${result.id}?submitted=1`);
  }
  return result;
}

export async function withdrawAttendanceRequest(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await prisma.attendanceRequest.findUnique({ where: { id } });
  if (!target) return;
  if (target.userId !== session.id) return;
  if (target.status !== "submitted") return;

  await prisma.attendanceRequest.delete({ where: { id } });
  revalidatePath("/attendance");
  revalidatePath("/attendance/paid-leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/dashboard/attendance");
  redirect("/attendance?withdrawn=1");
}

// -----------------------------------------------------------------------------
// 承認・差戻・却下
// -----------------------------------------------------------------------------

async function resolveReviewerId(
  principal: Awaited<ReturnType<typeof requireAdminOrDashboard>>,
): Promise<string | null> {
  if (principal.kind === "user") return principal.user.id;
  const dev = await prisma.user.findFirst({
    where: { role: "developer", isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return dev?.id ?? null;
}

type ReviewResult = { ok: true } | { ok: false; error: string };

async function applyReview(
  id: string,
  reviewerId: string,
  nextStatus: "approved" | "rejected" | "sent_back",
  comment: string | null,
): Promise<ReviewResult> {
  if (nextStatus !== "approved" && (!comment || comment.trim().length === 0)) {
    return { ok: false, error: "コメントを入力してください" };
  }
  if (comment && codePointLength(comment) > REVIEW_COMMENT_MAX_CHARS) {
    return { ok: false, error: `コメントは${REVIEW_COMMENT_MAX_CHARS}文字以内です` };
  }

  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });
  if (!reviewer || !isAdminRole(reviewer.role) || !reviewer.isActive) {
    return { ok: false, error: "承認権限がありません" };
  }

  // 承認時、substitute_leave なら元 holiday_work が approved のまま残っているか再確認
  if (nextStatus === "approved") {
    const req = await prisma.attendanceRequest.findUnique({ where: { id } });
    if (req?.category === "substitute_leave" && req.substituteForId) {
      const src = await prisma.overtimeRequest.findFirst({
        where: {
          id: req.substituteForId,
          category: "holiday_work",
          status: "approved",
        },
        select: { id: true },
      });
      if (!src) {
        return { ok: false, error: "元の休日出勤が承認済みでなくなっています" };
      }
    }
  }

  const updated = await prisma.attendanceRequest.updateMany({
    where: { id, status: "submitted" },
    data: {
      status: nextStatus,
      reviewerId,
      reviewedAt: new Date(),
      reviewComment: comment ?? null,
    },
  });
  if (updated.count === 0) {
    return { ok: false, error: "申請が他の操作で更新されています。画面を再読込してください" };
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/paid-leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/admin");
  return { ok: true };
}

export async function approveAttendanceAction(formData: FormData): Promise<void> {
  const principal = await requireAdminOrDashboard("/admin/attendance");
  const prefix = await adminPrefix();
  const reviewerId = await resolveReviewerId(principal);
  if (!reviewerId) {
    redirect(
      `${prefix}/attendance?error=${encodeURIComponent("有効な開発者ユーザーが見つかりません")}`,
    );
  }
  const id = String(formData.get("id") ?? "");
  const res = await applyReview(id, reviewerId!, "approved", null);
  if (!res.ok) {
    redirect(`${prefix}/attendance?id=${id}&error=${encodeURIComponent(res.error)}`);
  }
  redirect(`${prefix}/attendance?reviewed=1`);
}

export async function rejectAttendanceAction(formData: FormData): Promise<void> {
  const principal = await requireAdminOrDashboard("/admin/attendance");
  const prefix = await adminPrefix();
  const reviewerId = await resolveReviewerId(principal);
  if (!reviewerId) {
    redirect(
      `${prefix}/attendance?error=${encodeURIComponent("有効な開発者ユーザーが見つかりません")}`,
    );
  }
  const id = String(formData.get("id") ?? "");
  const comment = String(formData.get("comment") ?? "");
  const res = await applyReview(id, reviewerId!, "rejected", comment);
  if (!res.ok) {
    redirect(`${prefix}/attendance?id=${id}&error=${encodeURIComponent(res.error)}`);
  }
  redirect(`${prefix}/attendance?reviewed=1`);
}

export async function sendBackAttendanceAction(formData: FormData): Promise<void> {
  const principal = await requireAdminOrDashboard("/admin/attendance");
  const prefix = await adminPrefix();
  const reviewerId = await resolveReviewerId(principal);
  if (!reviewerId) {
    redirect(
      `${prefix}/attendance?error=${encodeURIComponent("有効な開発者ユーザーが見つかりません")}`,
    );
  }
  const id = String(formData.get("id") ?? "");
  const comment = String(formData.get("comment") ?? "");
  const res = await applyReview(id, reviewerId!, "sent_back", comment);
  if (!res.ok) {
    redirect(`${prefix}/attendance?id=${id}&error=${encodeURIComponent(res.error)}`);
  }
  redirect(`${prefix}/attendance?reviewed=1`);
}

// -----------------------------------------------------------------------------
// 有給付与（手動）
// -----------------------------------------------------------------------------

export async function grantPaidLeaveAction(formData: FormData): Promise<void> {
  const principal = await requireAdminOrDashboard("/admin/paid-leave");
  const prefix = await adminPrefix();
  const grantedById =
    principal.kind === "user" ? principal.user.id : (await resolveReviewerId(principal))!;
  const userId = String(formData.get("userId") ?? "").trim();
  const daysRaw = String(formData.get("days") ?? "");
  const grantedOnRaw = String(formData.get("grantedOn") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 200);

  const days = Number(daysRaw);
  if (!userId || !Number.isFinite(days) || days <= 0) {
    redirect(`${prefix}/paid-leave?error=${encodeURIComponent("入力値が不正です")}`);
  }
  let grantedOn: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(grantedOnRaw)) {
    redirect(`${prefix}/paid-leave?error=${encodeURIComponent("付与日の形式が不正です")}`);
  } else {
    grantedOn = startOfDateJST(new Date(`${grantedOnRaw}T00:00:00+09:00`));
  }

  await prisma.paidLeaveGrant.create({
    data: {
      userId,
      grantedOn: grantedOn!,
      expiresOn: expirationOf(grantedOn!),
      days,
      source: "manual",
      note: note || null,
      grantedById,
    },
  });
  revalidatePath("/attendance/paid-leave");
  revalidatePath("/admin/paid-leave");
  revalidatePath("/dashboard/paid-leave");
  revalidatePath("/");
  redirect(`${prefix}/paid-leave?granted=1`);
}

// -----------------------------------------------------------------------------
// 有給自動付与（管理画面ボタン or Cron）
// -----------------------------------------------------------------------------

export async function runAutoPaidLeaveGrantAction(): Promise<void> {
  await requireAdminOrDashboard("/admin/paid-leave");
  const prefix = await adminPrefix();
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { isActive: true, hireDate: { not: null } },
    select: { id: true, hireDate: true },
  });
  let granted = 0;
  let skipped = 0;
  for (const u of users) {
    if (!u.hireDate) continue;
    const scheduled = scheduledGrantDates(u.hireDate, now);
    for (const s of scheduled) {
      const existing = await prisma.paidLeaveGrant.findFirst({
        where: {
          userId: u.id,
          grantedOn: s.grantedOn,
          source: "auto",
        },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.paidLeaveGrant.create({
        data: {
          userId: u.id,
          grantedOn: s.grantedOn,
          expiresOn: expirationOf(s.grantedOn),
          days: s.days,
          source: "auto",
        },
      });
      granted++;
    }
  }
  revalidatePath("/attendance/paid-leave");
  revalidatePath("/admin/paid-leave");
  revalidatePath("/dashboard/paid-leave");
  redirect(`${prefix}/paid-leave?autoGrant=${granted},${skipped}`);
}
