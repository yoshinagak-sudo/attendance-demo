"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  validateAckInput,
  type AckInput,
} from "@/lib/daily-report";

export async function acknowledgeReport(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    redirect("/login?next=/admin/report");
  }
  const input: AckInput = {
    id: String(formData.get("id") ?? ""),
    ackComment: String(formData.get("ackComment") ?? ""),
  };
  const validated = validateAckInput(input);
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0] ?? "確認に失敗しました";
    redirect(`/admin/report/${input.id}?error=${encodeURIComponent(firstError)}`);
  }
  const v = validated.value;
  const updated = await prisma.dailyReport.updateMany({
    where: { id: v.id, status: "submitted" },
    data: {
      status: "acknowledged",
      acknowledgedById: session!.id,
      acknowledgedAt: new Date(),
      ackComment: v.ackComment,
    },
  });
  if (updated.count === 0) {
    redirect(`/admin/report/${v.id}?error=${encodeURIComponent("他の操作で更新されています")}`);
  }
  revalidatePath("/admin/report");
  revalidatePath(`/admin/report/${v.id}`);
  revalidatePath("/report");
  revalidatePath("/admin");
  redirect(`/admin/report/${v.id}?reviewed=1`);
}

export async function unacknowledgeReport(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    redirect("/login?next=/admin/report");
  }
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
  revalidatePath("/report");
  redirect(`/admin/report/${id}?reset=1`);
}
