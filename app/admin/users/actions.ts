"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboard } from "@/lib/auth-guard";
import { hashPassword, randomPasswordHumanFriendly } from "@/lib/password";

type RoleValue = "member" | "manager" | "developer";

function isRoleValue(v: unknown): v is RoleValue {
  return v === "member" || v === "manager" || v === "developer";
}

export type ResetPasswordState =
  | { ok: true; password: string; userId: string; userName: string }
  | { ok: false; error: string }
  | null;

/**
 * パスワード再発行。
 * 新しいパスワードを発行して DB を更新し、戻り値で **平文を1度だけ** 返す。
 * UI 側はモーダルで表示して、コピーされた後は再表示できない設計にする。
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  await requireAdminOrDashboard("/admin/users");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    return { ok: false, error: "ユーザーIDが不正です" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, error: "対象ユーザーが見つかりません" };
  }
  if (!target.loginId) {
    return { ok: false, error: "loginId が未設定のユーザーには再発行できません" };
  }

  const newPassword = randomPasswordHumanFriendly();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashPassword(newPassword),
      passwordUpdatedAt: new Date(),
    },
  });

  // 既存セッションは passwordUpdatedAt > session.iat の関係で自動失効する想定
  revalidatePath("/admin/users");
  revalidatePath("/dashboard/users");

  return {
    ok: true,
    password: newPassword,
    userId,
    userName: target.name,
  };
}

export type ToggleActiveState =
  | { ok: true; userId: string; isActive: boolean }
  | { ok: false; error: string }
  | null;

/**
 * ユーザーの active/inactive をトグル。
 * 最後の active manager を inactive にしようとする場合は拒否する。
 */
export async function toggleUserActiveAction(
  _prev: ToggleActiveState,
  formData: FormData,
): Promise<ToggleActiveState> {
  const principal = await requireAdminOrDashboard("/admin/users");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    return { ok: false, error: "ユーザーIDが不正です" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, error: "対象ユーザーが見つかりません" };
  }

  const nextActive = !target.isActive;

  // active な管理者(manager/developer)が target を inactive にしようとしている → 最後の1人保護
  const isTargetActiveAdmin =
    (target.role === "manager" || target.role === "developer") && target.isActive;
  if (!nextActive && isTargetActiveAdmin) {
    const activeAdminCount = await prisma.user.count({
      where: { isActive: true, role: { in: ["manager", "developer"] } },
    });
    if (activeAdminCount <= 1) {
      return {
        ok: false,
        error: "最後の有効な管理者(manager/developer)は無効化できません",
      };
    }
  }

  // 自分自身を inactive にしようとしている場合も、安全のため拒否（user session 経由時のみ）
  if (
    !nextActive &&
    principal.kind === "user" &&
    target.id === principal.user.id
  ) {
    return {
      ok: false,
      error: "自分自身を無効化することはできません",
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: nextActive },
  });
  revalidatePath("/admin/users");
  revalidatePath("/dashboard/users");

  return { ok: true, userId, isActive: nextActive };
}

export type ChangeRoleState =
  | { ok: true; userId: string; newRole: RoleValue }
  | { ok: false; error: string }
  | null;

/**
 * ユーザーの role を変更する（member / manager / developer）。
 * 制約:
 *  - 自分自身の role は変更できない（権限剥奪事故防止）
 *  - 最後の有効な管理者(manager+developer)を一般に降格できない
 */
export async function changeUserRoleAction(
  _prev: ChangeRoleState,
  formData: FormData,
): Promise<ChangeRoleState> {
  const principal = await requireAdminOrDashboard("/admin/users");
  const userId = String(formData.get("userId") ?? "").trim();
  const newRoleRaw = String(formData.get("newRole") ?? "").trim();
  if (!userId) {
    return { ok: false, error: "ユーザーIDが不正です" };
  }
  if (!isRoleValue(newRoleRaw)) {
    return { ok: false, error: "ロール指定が不正です" };
  }
  const newRole: RoleValue = newRoleRaw;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, error: "対象ユーザーが見つかりません" };
  }
  if (target.role === newRole) {
    return { ok: true, userId, newRole };
  }
  // 自分自身の role 変更は user session 経由時のみ抑止（dashboard 経由は別アカウントなのでOK）
  if (principal.kind === "user" && target.id === principal.user.id) {
    return { ok: false, error: "自分自身のロールは変更できません" };
  }

  // 管理者(manager+developer)が target の場合、最後の1人を降格しようとしていないか確認
  const isTargetAdmin = target.role === "manager" || target.role === "developer";
  const isNewAdmin = newRole === "manager" || newRole === "developer";
  if (isTargetAdmin && !isNewAdmin && target.isActive) {
    const activeAdminCount = await prisma.user.count({
      where: { isActive: true, role: { in: ["manager", "developer"] } },
    });
    if (activeAdminCount <= 1) {
      return {
        ok: false,
        error: "最後の有効な管理者(manager/developer)を降格できません",
      };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });
  revalidatePath("/admin/users");
  revalidatePath("/dashboard/users");

  return { ok: true, userId, newRole };
}

export type DeleteUserState =
  | { ok: true; userId: string; userName: string; removed: {
      timeRecord: number;
      overtimeAsApplicant: number;
      overtimeReviewerNulled: number;
      vehicleAssignment: number;
      drivingLog: number;
      refuelingLog: number;
      dailyReport: number;
      dailyReportAckNulled: number;
    } }
  | { ok: false; error: string }
  | null;

/**
 * ユーザーを DB から完全に削除する（不可逆）。
 * 関連する打刻・残業申請・車両割当・給油・運行・日報も一緒に消える。
 * 他人が提出した残業/日報の reviewer / acknowledgedBy にこの人が入っている場合は null 化する。
 *
 * 制約:
 *  - 自分自身は削除できない（session ログイン時のみ抑止）
 *  - 最後の有効な管理者(manager/developer)は削除できない
 */
export async function deleteUserAction(
  _prev: DeleteUserState,
  formData: FormData,
): Promise<DeleteUserState> {
  const principal = await requireAdminOrDashboard("/admin/users");
  const userId = String(formData.get("userId") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (!userId) {
    return { ok: false, error: "ユーザーIDが不正です" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, error: "対象ユーザーが見つかりません" };
  }
  if (principal.kind === "user" && target.id === principal.user.id) {
    return { ok: false, error: "自分自身は削除できません" };
  }
  if (confirmName !== target.name) {
    return {
      ok: false,
      error: "確認用の氏名が一致しません",
    };
  }

  // 最後の有効な管理者は削除禁止
  const isTargetActiveAdmin =
    target.isActive && (target.role === "manager" || target.role === "developer");
  if (isTargetActiveAdmin) {
    const activeAdminCount = await prisma.user.count({
      where: { isActive: true, role: { in: ["manager", "developer"] } },
    });
    if (activeAdminCount <= 1) {
      return {
        ok: false,
        error: "最後の有効な管理者(manager/developer)は削除できません",
      };
    }
  }

  const removed = await prisma.$transaction(async (tx) => {
    const [tr, ov, va, dl, rl, dr] = await Promise.all([
      tx.timeRecord.deleteMany({ where: { userId } }),
      tx.overtimeRequest.deleteMany({ where: { userId } }),
      tx.vehicleAssignment.deleteMany({ where: { userId } }),
      tx.drivingLog.deleteMany({ where: { userId } }),
      tx.refuelingLog.deleteMany({ where: { userId } }),
      tx.dailyReport.deleteMany({ where: { userId } }),
    ]);
    // 他人の残業申請の reviewerId, 他人の日報の acknowledgedById が
    // このユーザーを指しているものは null 化して、残す。
    const [ovRev, drAck] = await Promise.all([
      tx.overtimeRequest.updateMany({
        where: { reviewerId: userId },
        data: { reviewerId: null },
      }),
      tx.dailyReport.updateMany({
        where: { acknowledgedById: userId },
        data: { acknowledgedById: null },
      }),
    ]);
    await tx.user.delete({ where: { id: userId } });
    return {
      timeRecord: tr.count,
      overtimeAsApplicant: ov.count,
      overtimeReviewerNulled: ovRev.count,
      vehicleAssignment: va.count,
      drivingLog: dl.count,
      refuelingLog: rl.count,
      dailyReport: dr.count,
      dailyReportAckNulled: drAck.count,
    };
  });

  revalidatePath("/admin/users");
  revalidatePath("/dashboard/users");

  return { ok: true, userId, userName: target.name, removed };
}
