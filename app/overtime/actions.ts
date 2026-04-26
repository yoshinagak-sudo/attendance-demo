"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/admin-auth";
import {
  REVIEW_COMMENT_MAX_CHARS,
  codePointLength,
  validateCreateOvertimeInput,
  type CreateOvertimeInput,
  type ValidationErrors,
} from "@/lib/overtime";
import { parseHHmm } from "@/lib/time";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

async function persistRequest(input: CreateOvertimeInput, parentId: string | null): Promise<ActionResult> {
  const validated = validateCreateOvertimeInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  const user = await prisma.user.findUnique({ where: { id: v.userId } });
  if (!user) return { ok: false, errors: { userId: "申請者が見つかりません" } };

  const workSite = v.workSiteId
    ? await prisma.workSite.findUnique({ where: { id: v.workSiteId } })
    : await prisma.workSite.findUnique({ where: { name: v.workSiteName } });

  let workSiteId = workSite?.id ?? null;
  if (!workSite) {
    const created = await prisma.workSite.upsert({
      where: { name: v.workSiteName },
      update: {},
      create: { name: v.workSiteName },
    });
    workSiteId = created.id;
  }

  const created = await prisma.overtimeRequest.create({
    data: {
      userId: v.userId,
      workDate: v.workDate,
      startAt: v.startAt,
      endAt: v.endAt,
      durationMinutes: v.durationMinutes,
      workSiteName: v.workSiteName,
      workSiteId,
      description: v.description,
      requestType: v.requestType,
      status: "submitted",
      parentId,
    },
  });

  revalidatePath("/overtime");
  revalidatePath("/admin/overtime");
  revalidatePath("/admin");

  return { ok: true, id: created.id };
}

function readFormInput(formData: FormData): CreateOvertimeInput {
  return {
    userId: String(formData.get("userId") ?? ""),
    workDate: String(formData.get("workDate") ?? ""),
    startAt: String(formData.get("startAt") ?? ""),
    endAt: String(formData.get("endAt") ?? ""),
    workSiteName: String(formData.get("workSiteName") ?? ""),
    workSiteId: (formData.get("workSiteId") as string) || null,
    description: String(formData.get("description") ?? ""),
    requestType: String(formData.get("requestType") ?? ""),
  };
}

export async function createOvertimeRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = readFormInput(formData);
  const result = await persistRequest(input, null);
  if (result.ok) {
    redirect(`/overtime/${result.id}?submitted=1`);
  }
  return result;
}

export async function createResubmission(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parentId = String(formData.get("parentId") ?? "");
  if (!parentId) return { ok: false, errors: {}, formError: "再申請対象が見つかりません" };

  const parent = await prisma.overtimeRequest.findUnique({ where: { id: parentId } });
  if (!parent) return { ok: false, errors: {}, formError: "元の申請が見つかりません" };
  if (parent.status !== "sent_back") {
    return { ok: false, errors: {}, formError: "差戻状態の申請のみ再申請できます" };
  }

  const input = readFormInput(formData);
  if (!input.userId) input.userId = parent.userId;

  const result = await persistRequest(input, parent.id);
  if (result.ok) {
    redirect(`/overtime/${result.id}?submitted=1`);
  }
  return result;
}

export async function withdrawRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!id || !userId) return;

  const target = await prisma.overtimeRequest.findUnique({ where: { id } });
  if (!target) return;
  if (target.userId !== userId) return;
  if (target.status !== "submitted") return;

  await prisma.overtimeRequest.delete({ where: { id } });
  revalidatePath("/overtime");
  revalidatePath("/admin/overtime");
  redirect(`/overtime?actor=${encodeURIComponent(userId)}&withdrawn=1`);
}

export type ReviewActionResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

async function applyReview(
  id: string,
  reviewerId: string,
  nextStatus: "approved" | "rejected" | "sent_back",
  comment: string | null,
): Promise<ReviewActionResult> {
  if (!(await hasAdminAccess())) {
    return { ok: false, error: "管理者認証が必要です" };
  }
  if (nextStatus !== "approved" && (!comment || comment.trim().length === 0)) {
    return { ok: false, error: "コメントを入力してください" };
  }
  if (comment && codePointLength(comment) > REVIEW_COMMENT_MAX_CHARS) {
    return { ok: false, error: `コメントは${REVIEW_COMMENT_MAX_CHARS}文字以内です` };
  }

  const reviewer = await prisma.user.findUnique({ where: { id: reviewerId } });
  if (!reviewer || reviewer.role !== "manager") {
    return { ok: false, error: "承認権限がありません" };
  }

  const updated = await prisma.overtimeRequest.updateMany({
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

  if (nextStatus === "approved") {
    const r = await prisma.overtimeRequest.findUnique({ where: { id } });
    if (r?.workSiteId) {
      await prisma.workSite.update({
        where: { id: r.workSiteId },
        data: { usageCount: { increment: 1 } },
      });
    }
  }

  revalidatePath("/admin/overtime");
  revalidatePath("/admin/overtime/report");
  revalidatePath("/admin");
  revalidatePath("/overtime");
  return { ok: true, status: nextStatus };
}

export async function approveRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reviewerId = String(formData.get("reviewerId") ?? "");
  await applyReview(id, reviewerId, "approved", null);
  redirect("/admin/overtime?reviewed=1");
}

export async function rejectRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const comment = String(formData.get("comment") ?? "");
  const result = await applyReview(id, reviewerId, "rejected", comment);
  if (!result.ok) {
    redirect(`/admin/overtime?id=${id}&error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/overtime?reviewed=1");
}

export async function sendBackRequestAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const reviewerId = String(formData.get("reviewerId") ?? "");
  const comment = String(formData.get("comment") ?? "");
  const result = await applyReview(id, reviewerId, "sent_back", comment);
  if (!result.ok) {
    redirect(`/admin/overtime?id=${id}&error=${encodeURIComponent(result.error)}`);
  }
  redirect("/admin/overtime?reviewed=1");
}

export async function updateRegularEndTime(formData: FormData): Promise<void> {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/settings/overtime");
  }
  const value = String(formData.get("value") ?? "").trim();
  try {
    parseHHmm(value);
  } catch {
    redirect(`/admin/settings/overtime?error=${encodeURIComponent("HH:mm形式で入力してください")}`);
  }
  await prisma.appSetting.upsert({
    where: { key: "regular_end_time" },
    update: { value },
    create: { key: "regular_end_time", value },
  });
  revalidatePath("/admin/settings/overtime");
  revalidatePath("/overtime/new");
  redirect("/admin/settings/overtime?saved=1");
}

export async function upsertWorkSite(formData: FormData): Promise<void> {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/settings/overtime");
  }
  const name = String(formData.get("name") ?? "").trim().normalize("NFKC");
  if (name.length === 0) {
    redirect(`/admin/settings/overtime?error=${encodeURIComponent("現場名を入力してください")}`);
  }
  await prisma.workSite.upsert({
    where: { name },
    update: { isActive: true },
    create: { name },
  });
  revalidatePath("/admin/settings/overtime");
  revalidatePath("/overtime/new");
  redirect("/admin/settings/overtime?saved=1");
}

export async function deactivateWorkSite(formData: FormData): Promise<void> {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/settings/overtime");
  }
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.workSite.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings/overtime");
  redirect("/admin/settings/overtime");
}
