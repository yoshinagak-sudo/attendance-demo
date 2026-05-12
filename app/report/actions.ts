"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  validateUpsertReportInput,
  type UpsertReportInput,
  type UpsertReportItemInput,
  type ValidationErrors,
} from "@/lib/daily-report";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

function parseItemsPayload(raw: string): UpsertReportItemInput[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p, idx) => {
      const o = p as Record<string, unknown>;
      return {
        orderIndex: typeof o.orderIndex === "number" ? o.orderIndex : idx,
        startTime: String(o.startTime ?? ""),
        endTime: String(o.endTime ?? ""),
        description: String(o.description ?? ""),
        workSiteName: String(o.workSiteName ?? ""),
        workSiteId: (o.workSiteId as string | null | undefined) ?? null,
      };
    });
  } catch {
    return [];
  }
}

async function persistReport(
  input: UpsertReportInput,
): Promise<ActionResult> {
  const validated = validateUpsertReportInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  // WorkSite upsert
  const siteIdByName = new Map<string, string>();
  for (const it of v.items) {
    if (siteIdByName.has(it.workSiteName)) continue;
    if (it.workSiteId) {
      siteIdByName.set(it.workSiteName, it.workSiteId);
      continue;
    }
    const existing = await prisma.workSite.findUnique({ where: { name: it.workSiteName } });
    if (existing) {
      siteIdByName.set(it.workSiteName, existing.id);
    } else {
      const created = await prisma.workSite.upsert({
        where: { name: it.workSiteName },
        update: {},
        create: { name: it.workSiteName },
      });
      siteIdByName.set(it.workSiteName, created.id);
    }
  }

  const existing = await prisma.dailyReport.findUnique({
    where: { userId_reportDate: { userId: v.userId, reportDate: v.reportDate } },
  });
  let reportId: string;
  if (existing) {
    if (existing.status === "acknowledged" && input.userId === v.userId) {
      return { ok: false, errors: {}, formError: "確認済の日報は編集できません" };
    }
    await prisma.dailyReportItem.deleteMany({ where: { reportId: existing.id } });
    await prisma.dailyReport.update({
      where: { id: existing.id },
      data: {
        progressNote: v.progressNote,
        totalMinutes: v.totalMinutes,
      },
    });
    reportId = existing.id;
  } else {
    const created = await prisma.dailyReport.create({
      data: {
        userId: v.userId,
        reportDate: v.reportDate,
        progressNote: v.progressNote,
        totalMinutes: v.totalMinutes,
        status: "draft",
      },
    });
    reportId = created.id;
  }

  if (v.items.length > 0) {
    await prisma.dailyReportItem.createMany({
      data: v.items.map((it, idx) => ({
        reportId,
        orderIndex: idx,
        startAt: it.startAt,
        endAt: it.endAt,
        durationMinutes: it.durationMinutes,
        description: it.description,
        workSiteName: it.workSiteName,
        workSiteId: siteIdByName.get(it.workSiteName) ?? null,
      })),
    });
  }

  revalidatePath("/report");
  revalidatePath("/admin/report");
  return { ok: true, id: reportId };
}

export async function upsertReport(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, errors: {}, formError: "ログインしてください" };
  const payload = String(formData.get("payload") ?? "");
  const reportDate = String(formData.get("reportDate") ?? "");
  const progressNote = String(formData.get("progressNote") ?? "");
  const items = parseItemsPayload(payload);
  const input: UpsertReportInput = {
    userId: session.id,
    reportDate,
    progressNote,
    items,
  };
  return persistReport(input);
}

export async function submitReport(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const payload = String(formData.get("payload") ?? "");
  const reportDate = String(formData.get("reportDate") ?? "");
  const progressNote = String(formData.get("progressNote") ?? "");
  const items = parseItemsPayload(payload);
  const result = await persistReport({
    userId: session.id,
    reportDate,
    progressNote,
    items,
  });
  if (!result.ok) {
    const firstError = Object.values(result.errors)[0] ?? result.formError ?? "送信に失敗しました";
    redirect(`/report/today?error=${encodeURIComponent(firstError)}`);
  }
  if (items.length === 0) {
    redirect(`/report/today?error=${encodeURIComponent("作業アイテムを1件以上追加してください")}`);
  }
  await prisma.dailyReport.update({
    where: { id: result.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  revalidatePath("/report");
  revalidatePath("/admin/report");
  redirect("/report?submitted=1");
}

export async function withdrawReport(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const report = await prisma.dailyReport.findUnique({ where: { id } });
  if (!report) return;
  if (report.userId !== session.id) return;
  if (report.status !== "submitted") return;
  await prisma.dailyReport.update({
    where: { id },
    data: { status: "draft", submittedAt: null },
  });
  revalidatePath("/report");
  revalidatePath("/admin/report");
  redirect("/report?withdrawn=1");
}

export async function ensureTodayReport(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login?next=/report/today");
  redirect("/report/today");
}
