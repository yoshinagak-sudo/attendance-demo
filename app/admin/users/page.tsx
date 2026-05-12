import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { formatJSTYmdHm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { UserRowActions } from "./user-row-actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireManager("/admin/users");

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "desc" }, { name: "asc" }],
  });
  const activeManagerCount = users.filter(
    (u) => u.role === "manager" && u.isActive,
  ).length;

  return (
    <>
      <AppHeader user={session} />
      <main className="container-wide">
        <header className="header">
          <div>
            <h1 className="title">ユーザー管理</h1>
            <span className="subtitle">
              アカウント・パスワード再発行・有効/無効
            </span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/admin" className="link">
              ← 管理画面
            </Link>
          </div>
        </header>

        <section className="section" aria-labelledby="admin-users-heading">
          <div className="section-head">
            <h2 id="admin-users-heading" className="section-title">
              全ユーザー
            </h2>
            <span className="section-sub tabular">
              全 {users.length} 名・有効 manager {activeManagerCount} 名
            </span>
          </div>

          <div className="admin-users-shell">
          <div className="table-wrap is-scrollable">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>loginId</th>
                  <th style={{ width: 96 }}>ロール</th>
                  <th style={{ width: 160 }}>最終ログイン</th>
                  <th style={{ width: 80 }}>状態</th>
                  <th style={{ width: 1 }} aria-label="アクション" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === session.id;
                  const isLastActiveManager =
                    u.role === "manager" &&
                    u.isActive &&
                    activeManagerCount <= 1;
                  return (
                    <tr
                      key={u.id}
                      className={u.isActive ? undefined : "is-inactive"}
                    >
                      <td>
                        <span className="admin-users-name">{u.name}</span>
                        {isSelf && (
                          <span className="admin-users-self-tag">あなた</span>
                        )}
                      </td>
                      <td>
                        <span className="admin-users-loginid">
                          {u.loginId ?? <em style={{ color: "var(--muted-2)" }}>未設定</em>}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            u.role === "manager"
                              ? "admin-users-role-manager"
                              : "admin-users-role-member"
                          }
                        >
                          {u.role === "manager" ? "manager" : "member"}
                        </span>
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
                          disableDeactivate={isSelf || isLastActiveManager}
                          disableDeactivateReason={
                            isSelf
                              ? "自分自身は無効化できません"
                              : isLastActiveManager
                                ? "最後の有効な管理者は無効化できません"
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
        </section>
      </main>
    </>
  );
}
