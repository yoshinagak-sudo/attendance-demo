import { unstable_noStore as noStore } from "next/cache";
import { Users } from "lucide-react";
import { requireDashboardSession } from "@/app/dashboard/_lib/require-dashboard";
import { getEmployees } from "@/app/dashboard/_lib/data";
import { formatJSTYmdHm } from "@/lib/time";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  developer: "開発者",
  manager: "管理者",
  member: "社員",
};

function roleClass(role: string): string {
  if (role === "developer") return "dash-role dash-role-developer";
  if (role === "manager") return "dash-role dash-role-manager";
  return "dash-role dash-role-member";
}

export default async function EmployeesPage() {
  noStore();
  await requireDashboardSession();
  const rows = await getEmployees();

  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">社員</span>
          <h1 className="dash-page-title">社員一覧</h1>
          <span className="dash-page-sub">
            ログイン方法・最終アクセス・有効/無効の閲覧専用ビュー
          </span>
        </div>
        <div className="dash-page-side">
          <Users size={16} aria-hidden="true" />
          全 {rows.length} 名（有効 {activeCount} 名）
        </div>
      </header>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">社員一覧</h2>
          <span className="dash-section-sub">
            有効 {activeCount} 名 / 無効 {rows.length - activeCount} 名
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="dash-empty">登録された社員がいません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">名前</th>
                    <th scope="col">ロール</th>
                    <th scope="col">ログインID</th>
                    <th scope="col">最終ログイン</th>
                    <th scope="col">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td className="dash-td-name">{u.name}</td>
                      <td>
                        <span className={roleClass(u.role)}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td>
                        {u.loginId ? (
                          <span className="dash-loginid-text">{u.loginId}</span>
                        ) : u.hasLine ? (
                          <span className="dash-pill-line">LINE</span>
                        ) : (
                          <span className="dash-td-muted">—</span>
                        )}
                      </td>
                      <td className="dash-td-num">
                        {u.lastLoginAt ? (
                          formatJSTYmdHm(u.lastLoginAt)
                        ) : (
                          <span className="dash-td-muted">未ログイン</span>
                        )}
                      </td>
                      <td>
                        {u.isActive ? (
                          <span className="dash-badge dash-badge-working">
                            有効
                          </span>
                        ) : (
                          <span className="dash-badge dash-badge-notyet">
                            無効
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="dash-note">
        この画面は閲覧専用です。社員の追加・編集・無効化は社員向け勤怠アプリの管理画面から行ってください。
      </div>
    </>
  );
}
