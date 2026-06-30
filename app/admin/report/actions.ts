"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboard, adminPrefix } from "@/lib/auth-guard";
import {
  validateAckInput,
  type AckInput,
} from "@/lib/daily-report";

// dashboard 経由で acknowledged を記録する時に使う「統括管理者」相当のフォールバック User ID。
// 開発者(developer)が必ず存在する想定で最初の developer を採用する。
async function resolveActorUserId(
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

export async function acknowledgeReport(formData: FormData): Promise<void> {
  const principal = await requireAdminOrDashboard("/admin/report");
  const prefix = await adminPrefix();
  const actorId = await resolveActorUserId(principal);
  if (!actorId) {
    redirect(`${prefix}/report?error=${encodeURIComponent("有効な開発者ユーザーが見つかりません")}`);
  }
  const input: AckInput = {
    id: String(formData.get("id") ?? ""),
    ackComment: String(formData.get("ackComment") ?? ""),
  };
  const validated = validateAckInput(input);
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0] ?? "確認に失敗しました";
    redirect(`${prefix}/report/${input.id}?error=${encodeURIComponent(firstError)}`);
  }
  const v = validated.value;
  const updated = await prisma.dailyReport.updateMany({
    where: { id: v.id, status: "submitted" },
    data: {
      status: "acknowledged",
      acknowledgedById: actorId!,
      acknowledgedAt: new Date(),
      ackComment: v.ackComment,
    },
  });
  if (updated.count === 0) {
    redirect(`${prefix}/report/${v.id}?error=${encodeURIComponent("他の操作で更新されています")}`);
  }
  revalidatePath("/admin/report");
  revalidatePath(`/admin/report/${v.id}`);
  revalidatePath("/dashboard/report");
  revalidatePath(`/dashboard/report/${v.id}`);
  revalidatePath("/report");
  revalidatePath("/admin");
  redirect(`${prefix}/report/${v.id}?reviewed=1`);
}

export async function unacknowledgeReport(formData: FormData): Promise<void> {
  await requireAdminOrDashboard("/admin/report");
  const prefix = await adminPrefix();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.dailyReport.update({
    where: { id },
    data: {
      status: "draft",
      acknowledgedById: null,
      acknowledgedAt: null,
      ackComment: null,
      submittedAt: null,
    },
  });
  revalidatePath("/admin/report");
  revalidatePath(`/admin/report/${id}`);
  revalidatePath("/dashboard/report");
  revalidatePath(`/dashboard/report/${id}`);
  revalidatePath("/report");
  redirect(`${prefix}/report/${id}?reset=1`);
}
