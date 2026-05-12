"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { validateUpsertVehicleInput, type UpsertVehicleInput } from "@/lib/vehicle";

export async function upsertVehicle(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    redirect("/login?next=/admin/settings/vehicle");
  }
  const id = String(formData.get("id") ?? "");
  const input: UpsertVehicleInput = {
    plate: String(formData.get("plate") ?? ""),
    model: String(formData.get("model") ?? ""),
    depot: String(formData.get("depot") ?? ""),
    inspectionDueDate: (formData.get("inspectionDueDate") as string) || null,
  };
  const validated = validateUpsertVehicleInput(input);
  if (!validated.ok) {
    const firstError = Object.values(validated.errors)[0] ?? "入力エラー";
    redirect(`/admin/settings/vehicle?error=${encodeURIComponent(firstError)}`);
  }
  const v = validated.value;
  if (id) {
    await prisma.vehicle.update({
      where: { id },
      data: {
        plate: v.plate,
        model: v.model,
        depot: v.depot,
        inspectionDueDate: v.inspectionDueDate,
        isActive: true,
      },
    });
  } else {
    await prisma.vehicle.create({
      data: {
        plate: v.plate,
        model: v.model,
        depot: v.depot,
        inspectionDueDate: v.inspectionDueDate,
      },
    });
  }
  revalidatePath("/admin/settings/vehicle");
  revalidatePath("/admin/vehicle");
  revalidatePath("/vehicle");
  redirect("/admin/settings/vehicle?saved=1");
}

export async function deactivateVehicle(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    redirect("/login?next=/admin/settings/vehicle");
  }
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.vehicleAssignment.updateMany({
    where: { vehicleId: id, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  await prisma.vehicle.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings/vehicle");
  revalidatePath("/admin/vehicle");
  revalidatePath("/vehicle");
  redirect("/admin/settings/vehicle?saved=1");
}

export async function reactivateVehicle(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    redirect("/login?next=/admin/settings/vehicle");
  }
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.vehicle.update({ where: { id }, data: { isActive: true } });
  revalidatePath("/admin/settings/vehicle");
  revalidatePath("/admin/vehicle");
  revalidatePath("/vehicle");
  redirect("/admin/settings/vehicle?saved=1");
}
