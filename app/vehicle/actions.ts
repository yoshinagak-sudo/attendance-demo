"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  validateStartDrivingInput,
  validateFinishDrivingInput,
  validateCreateRefuelingInput,
  type StartDrivingInput,
  type FinishDrivingInput,
  type CreateRefuelingInput,
  type ValidationErrors,
} from "@/lib/vehicle";
import { startOfTodayJST } from "@/lib/time";

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; errors: ValidationErrors; formError?: string };

export async function assignVehicle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, errors: {}, formError: "ログインしてください" };
  const vehicleId = String(formData.get("vehicleId") ?? "");
  if (!vehicleId) return { ok: false, errors: { vehicleId: "車両を選択してください" } };

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || !vehicle.isActive)
    return { ok: false, errors: { vehicleId: "車両が見つかりません" } };

  const today = startOfTodayJST();

  await prisma.vehicleAssignment.updateMany({
    where: { userId: session.id, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  await prisma.vehicleAssignment.updateMany({
    where: { vehicleId, releasedAt: null },
    data: { releasedAt: new Date() },
  });

  const created = await prisma.vehicleAssignment.create({
    data: { vehicleId, userId: session.id, assignDate: today },
  });

  revalidatePath("/vehicle");
  revalidatePath("/admin/vehicle");
  redirect(`/vehicle?assigned=${vehicleId}`);
  return { ok: true, id: created.id };
}

export async function releaseAssignment(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const a = await prisma.vehicleAssignment.findUnique({ where: { id } });
  if (!a) return;
  if (a.userId !== session.id && session.role !== "manager") return;
  if (a.releasedAt) return;
  await prisma.vehicleAssignment.update({
    where: { id },
    data: { releasedAt: new Date() },
  });
  revalidatePath("/vehicle");
  revalidatePath("/admin/vehicle");
  redirect("/vehicle?released=1");
}

export async function startDriving(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, errors: {}, formError: "ログインしてください" };
  const input: StartDrivingInput = {
    vehicleId: String(formData.get("vehicleId") ?? ""),
    startOdometer: String(formData.get("startOdometer") ?? ""),
    purpose: String(formData.get("purpose") ?? ""),
    workSiteName: String(formData.get("workSiteName") ?? ""),
    workSiteId: (formData.get("workSiteId") as string) || null,
  };
  const validated = validateStartDrivingInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  const assignment = await prisma.vehicleAssignment.findFirst({
    where: { vehicleId: v.vehicleId, userId: session.id, releasedAt: null },
  });
  if (!assignment) {
    return {
      ok: false,
      errors: { vehicleId: "この車両は自分に割り当てられていません" },
    };
  }

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

  const now = new Date();
  const today = startOfTodayJST();
  const created = await prisma.drivingLog.create({
    data: {
      vehicleId: v.vehicleId,
      userId: session.id,
      workDate: today,
      startAt: now,
      startOdometer: v.startOdometer,
      purpose: v.purpose,
      workSiteName: v.workSiteName,
      workSiteId,
      status: "in_progress",
    },
  });

  revalidatePath("/vehicle");
  revalidatePath("/admin/vehicle");
  redirect(`/vehicle/driving/${created.id}`);
  return { ok: true, id: created.id };
}

export async function finishDriving(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, errors: {}, formError: "ログインしてください" };
  const input: FinishDrivingInput = {
    drivingLogId: String(formData.get("drivingLogId") ?? ""),
    endOdometer: String(formData.get("endOdometer") ?? ""),
  };
  const validated = validateFinishDrivingInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  const log = await prisma.drivingLog.findUnique({ where: { id: v.drivingLogId } });
  if (!log) return { ok: false, errors: { drivingLogId: "走行ログが見つかりません" } };
  if (log.userId !== session.id && session.role !== "manager") {
    return { ok: false, errors: {}, formError: "この走行ログは編集できません" };
  }
  if (log.status !== "in_progress") {
    return { ok: false, errors: {}, formError: "この走行は既に帰着登録済みです" };
  }
  if (v.endOdometer < log.startOdometer) {
    return {
      ok: false,
      errors: { endOdometer: "帰着時メーターは出発時より大きい値にしてください" },
    };
  }

  const distance = v.endOdometer - log.startOdometer;
  const updated = await prisma.drivingLog.updateMany({
    where: { id: v.drivingLogId, status: "in_progress" },
    data: {
      endAt: new Date(),
      endOdometer: v.endOdometer,
      distanceKm: distance,
      status: "completed",
    },
  });
  if (updated.count === 0) {
    return { ok: false, errors: {}, formError: "他の操作で更新されています。再読込してください" };
  }

  revalidatePath("/vehicle");
  revalidatePath("/vehicle/history");
  revalidatePath("/admin/vehicle");
  redirect(`/vehicle?completed=${v.drivingLogId}`);
  return { ok: true, id: v.drivingLogId };
}

export async function cancelDriving(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const id = String(formData.get("drivingLogId") ?? "");
  if (!id) return;
  const log = await prisma.drivingLog.findUnique({ where: { id } });
  if (!log) return;
  if (log.userId !== session.id) return;
  if (log.status !== "in_progress") return;
  if (Date.now() - log.createdAt.getTime() > 5 * 60 * 1000) return;
  await prisma.drivingLog.delete({ where: { id } });
  revalidatePath("/vehicle");
  revalidatePath("/admin/vehicle");
  redirect("/vehicle?cancelled=1");
}

export async function createRefueling(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, errors: {}, formError: "ログインしてください" };
  const input: CreateRefuelingInput = {
    vehicleId: String(formData.get("vehicleId") ?? ""),
    refuelDate: String(formData.get("refuelDate") ?? ""),
    liters: String(formData.get("liters") ?? ""),
    amountJpy: String(formData.get("amountJpy") ?? ""),
    stationName: String(formData.get("stationName") ?? ""),
    note: String(formData.get("note") ?? ""),
  };
  const validated = validateCreateRefuelingInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const v = validated.value;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: v.vehicleId } });
  if (!vehicle) return { ok: false, errors: { vehicleId: "車両が見つかりません" } };

  const created = await prisma.refuelingLog.create({
    data: {
      vehicleId: v.vehicleId,
      userId: session.id,
      refuelDate: v.refuelDate,
      liters: v.liters,
      amountJpy: v.amountJpy,
      stationName: v.stationName,
      note: v.note,
    },
  });

  revalidatePath("/vehicle");
  revalidatePath("/vehicle/history");
  revalidatePath("/admin/vehicle");
  redirect(`/vehicle?refueled=${v.vehicleId}`);
  return { ok: true, id: created.id };
}
