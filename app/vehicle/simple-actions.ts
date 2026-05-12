"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { startOfTodayJST } from "@/lib/time";

export async function assignVehicleSimple(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login?next=/vehicle");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  if (!vehicleId) redirect("/vehicle?error=" + encodeURIComponent("車両を選択してください"));

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || !vehicle.isActive)
    redirect("/vehicle?error=" + encodeURIComponent("車両が見つかりません"));

  const today = startOfTodayJST();
  await prisma.vehicleAssignment.updateMany({
    where: { userId: session!.id, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  await prisma.vehicleAssignment.updateMany({
    where: { vehicleId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  await prisma.vehicleAssignment.create({
    data: { vehicleId, userId: session!.id, assignDate: today },
  });
  revalidatePath("/vehicle");
  revalidatePath("/admin/vehicle");
  redirect(`/vehicle?assigned=${vehicleId}`);
}

export async function releaseAssignmentSimple(formData: FormData): Promise<void> {
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
