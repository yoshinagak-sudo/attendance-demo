"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireManager } from "@/lib/session";
import { postSlackFeedback, buildImprovementMessage } from "@/lib/notify";

const MAX_BODY = 1000;

function resolveAppUrl(): string {
  const url = process.env.APP_PUBLIC_URL || process.env.VERCEL_URL;
  if (!url) return "https://attendance-demo-dun.vercel.app";
  return url.startsWith("http") ? url : `https://${url}`;
}

export type SubmitState =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | null;

export async function submitImprovementAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await requireSession("/improvements");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    return { ok: false, error: "本文を入力してください" };
  }
  if (body.length > MAX_BODY) {
    return { ok: false, error: `本文は ${MAX_BODY} 文字以内です` };
  }

  const created = await prisma.improvement.create({
    data: { authorId: session.id, body },
  });

  // Slack 通知（失敗してもユーザー体験は壊さない）。awaitしない fire-and-forget でも良いが、
  // Vercel の serverless はレスポンス後の処理が打ち切られるので await して待つ。
  await postSlackFeedback(
    buildImprovementMessage({
      authorName: session.name,
      authorRole: session.role,
      body,
      improvementId: created.id,
      appUrl: resolveAppUrl(),
    }),
  );

  revalidatePath("/improvements");
  revalidatePath("/admin/improvements");
  return { ok: true, id: created.id };
}

const STATUSES = ["open", "in_progress", "done", "wontfix"] as const;
type Status = (typeof STATUSES)[number];
function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v);
}

export type StatusState =
  | { ok: true; id: string; status: Status }
  | { ok: false; error: string }
  | null;

export async function changeImprovementStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  const session = await requireManager("/admin/improvements");
  const id = String(formData.get("id") ?? "").trim();
  const newStatus = String(formData.get("status") ?? "").trim();
  if (!id) return { ok: false, error: "IDが不正です" };
  if (!isStatus(newStatus)) return { ok: false, error: "ステータス指定が不正です" };

  const updated = await prisma.improvement.update({
    where: { id },
    data: { status: newStatus, handledById: session.id },
  });
  revalidatePath("/improvements");
  revalidatePath("/admin/improvements");
  return { ok: true, id, status: updated.status as Status };
}
