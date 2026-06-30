import { unstable_noStore as noStore } from "next/cache";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import { formatJSTYmdHm } from "@/lib/time";
import {
  UserRowActions,
  RoleSelector,
} from "@/app/admin/users/user-row-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DashboardUsersPage() {
  noStore();
  await requireDashboardSession();

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "desc" }, { name: "asc" }],
  });
  const isAdminRoleStr = (r: string) => r === "manager" || r === "developer";
  const activeAdminCount = users.filter(
    (u) => isAdminRoleStr(u.role) && u.isActive,
  ).length;

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">社員管理</span>
          <h1 className="dash-page-title">社員管理</h1>
          <span className="dash-page-sub">
            ロール変更・パスワード再発行・有効/無効を切り替えできます
          </span>
        </div>
        <div className="dash-page-side">
          <Users size={16} aria-hidden="true" />
          全 {users.length} 名・管理者 {activeAdminCount} 名
        </div>
      </header>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">全ユーザー</h2>
          <span className="dash-section-sub">
            有効 {users.filter((u) => u.isActive).length} 名 / 無効{" "}
            {users.filter((u) => !u.isActive).length} 名
          </span>
        </div>

        {users.length === 0 ? (
          <div className="dash-empty">登録された社員がいません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>氏名</th>
                    <th>loginId</th>
                    <th style={{ width: 120 }}>ロール</th>
                    <th style={{ width: 160 }}>最終ログイン</th>
                    <th style={{ width: 80 }}>状態</th>
                    <th style={{ width: 1 }} aria-label="アクション" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const uIsAdmin = isAdminRoleStr(u.role);
                    const isLastActiveAdmin =
                      uIsAdmin && u.isActive && activeAdminCount <= 1;
                    const roleNormalized:
                      | "member"
                      | "manager"
                      | "developer" =
                      u.role === "developer"
                        ? "developer"
                        : u.role === "manager"
                          ? "manager"
                          : "member";
                    return (
                      <tr
                        key={u.id}
                        className={u.isActive ? undefined : "is-inactive"}
                      >
                        <td>
                          <span className="admin-users-name">{u.name}</span>
                        </td>
                        <td>
                          <span className="admin-users-loginid">
                            {u.loginId ?? (
                              <em style={{ color: "var(--muted-2)" }}>未設定</em>
                            )}
                          </span>
                        </td>
                        <td>
                          <RoleSelector
                            userId={u.id}
                            currentRole={roleNormalized}
                            disabled={false}
                            lockedToAdmin={isLastActiveAdmin && uIsAdmin}
                          />
                        </td>
                        <td>
                          {u.lastLoginAt ? (
                            <span className="admin-users-last-login num">
                              {formatJSTYmdHm(u.lastLoginAt)}
                            </span>
                          ) : (
                            <span className="admin-users-last-login admin-users-last-login-empty">
                              未ログイン
                            </span>
                          )}
                        </td>
                        <td>
                          {u.isActive ? (
                            <span className="ot-site-badge-active">有効</span>
                          ) : (
                            <span className="ot-site-badge-inactive">無効</span>
                          )}
                        </td>
                        <td className="admin-users-actions">
                          <UserRowActions
                            userId={u.id}
                            userName={u.name}
                            isActive={u.isActive}
                            hasLoginId={!!u.loginId}
                            disableDeactivate={isLastActiveAdmin}
                            disableDeactivateReason={
                              isLastActiveAdmin
                                ? "最後の有効な管理者(manager/developer)は無効化できません"
                                : undefined
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="dash-note">
        ロールを「管理者」に変更したユーザーは、社員向け勤怠アプリ
        <code> attendance-ninau.vercel.app</code> にログインすると管理画面にアクセスできるようになります。
      </div>
    </>
  );
}
