"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { hashPassword, randomPasswordHumanFriendly } from "@/lib/password";

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
  await requireManager("/admin/users");
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
  const session = await requireManager("/admin/users");
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) {
    return { ok: false, error: "ユーザーIDが不正です" };
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, error: "対象ユーザーが見つかりません" };
  }

  const nextActive = !target.isActive;

  // active な manager が target を inactive にしようとしている → 最後の1人保護
  if (!nextActive && target.role === "manager" && target.isActive) {
    const activeManagerCount = await prisma.user.count({
      where: { role: "manager", isActive: true },
    });
    if (activeManagerCount <= 1) {
      return {
        ok: false,
        error: "最後の有効な管理者は無効化できません",
      };
    }
  }

  // 自分自身を inactive にしようとしている場合も、安全のため拒否
  if (!nextActive && target.id === session.id) {
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

  return { ok: true, userId, isActive: nextActive };
}
