import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasAdminAccess } from "@/lib/admin-auth";
import {
  updateRegularEndTime,
  upsertWorkSite,
  deactivateWorkSite,
} from "@/app/overtime/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string; error?: string }>;

export default async function AdminOvertimeSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await hasAdminAccess())) {
    redirect("/admin/overtime/auth?next=/admin/settings/overtime");
  }

  const sp = await searchParams;
  const saved = sp.saved === "1";
  const errorMsg = sp.error;

  const [setting, workSites] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "regular_end_time" } }),
    prisma.workSite.findMany({
      orderBy: [{ isActive: "desc" }, { usageCount: "desc" }, { name: "asc" }],
    }),
  ]);

  const regularEndTime = setting?.value ?? "17:30";
  const activeCount = workSites.filter((w) => w.isActive).length;

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">残業設定</h1>
          <span className="subtitle">所定終業時刻・現場名マスタ</span>
        </div>
        <div className="ot-admin-actions">
          <Link href="/admin/overtime" className="link">
            承認キュー
          </Link>
          <Link href="/admin/overtime/report" className="link">
            月次レポート
          </Link>
          <Link href="/admin" className="link">
            ← 管理
          </Link>
        </div>
      </header>

      {saved && (
        <div className="ot-banner ot-banner-success" role="status">
          <span className="ot-banner-icon" aria-hidden="true">
            ✓
          </span>
          <div className="ot-banner-body">設定を保存しました</div>
        </div>
      )}

      {errorMsg && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">{errorMsg}</div>
        </div>
      )}

      <div className="ot-settings-grid">
        {/* セクション1: 所定終業時刻 */}
        <section
          className="ot-form-card"
          aria-labelledby="ot-setting-end-heading"
        >
          <h2 id="ot-setting-end-heading" className="ot-section-title">
            所定終業時刻
          </h2>

          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              margin: "0 0 12px",
              lineHeight: 1.55,
            }}
          >
            残業申請の開始時刻のデフォルトに使われます。現在の設定:{" "}
            <strong className="num" style={{ color: "var(--text)" }}>
              {regularEndTime}
            </strong>
          </p>

          <form action={updateRegularEndTime}>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="regular-end-time">
                時刻（HH:mm）
              </label>
              <div className="ot-time-row">
                <input
                  id="regular-end-time"
                  type="time"
                  name="value"
                  defaultValue={regularEndTime}
                  className="ot-input"
                  required
                  step={300}
                />
                <button type="submit" className="ot-btn-primary">
                  保存
                </button>
              </div>
              <p className="ot-field-help">
                例: 17:30 / 18:00。事業所の定時に合わせて設定してください
              </p>
            </div>
          </form>
        </section>

        {/* セクション2: 現場名マスタ */}
        <section
          className="ot-form-card"
          aria-labelledby="ot-setting-sites-heading"
        >
          <h2 id="ot-setting-sites-heading" className="ot-section-title">
            現場名マスタ
          </h2>

          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              margin: "0 0 12px",
              lineHeight: 1.55,
            }}
          >
            残業申請時に選べる現場一覧です。利用回数の多いものから上に並びます。
            <span className="num" style={{ marginLeft: 6, color: "var(--text-sub)" }}>
              有効 {activeCount} / 全 {workSites.length}
            </span>
          </p>

          <form action={upsertWorkSite} className="ot-add-row">
            <input
              type="text"
              name="name"
              required
              maxLength={50}
              placeholder="現場名を入力（例: 東館A棟）"
              className="ot-input"
              aria-label="新しい現場名"
            />
            <button type="submit" className="ot-btn-primary">
              + 追加
            </button>
          </form>

          {workSites.length === 0 ? (
            <div className="ot-empty" style={{ marginTop: 8 }}>
              <div className="ot-empty-title">現場が登録されていません</div>
              <div>上のフォームから追加してください</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table ot-site-table">
                <thead>
                  <tr>
                    <th>現場名</th>
                    <th style={{ textAlign: "right", width: 90 }}>利用回数</th>
                    <th style={{ width: 80 }}>状態</th>
                    <th style={{ width: 1 }} aria-label="アクション" />
                  </tr>
                </thead>
                <tbody>
                  {workSites.map((w) => (
                    <tr
                      key={w.id}
                      className={w.isActive ? undefined : "is-inactive"}
                    >
                      <td style={{ fontWeight: 600, color: "var(--text)" }}>
                        {w.name}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {w.usageCount}
                      </td>
                      <td>
                        {w.isActive ? (
                          <span className="ot-site-badge-active">有効</span>
                        ) : (
                          <span className="ot-site-badge-inactive">無効</span>
                        )}
                      </td>
                      <td className="ot-row-actions-end">
                        {w.isActive ? (
                          <form
                            action={deactivateWorkSite}
                            style={{ display: "inline-flex" }}
                          >
                            <input type="hidden" name="id" value={w.id} />
                            <button
                              type="submit"
                              className="ot-btn-ghost ot-btn-sm"
                              style={{ color: "var(--warn)" }}
                            >
                              無効化
                            </button>
                          </form>
                        ) : (
                          <form
                            action={upsertWorkSite}
                            style={{ display: "inline-flex" }}
                          >
                            <input type="hidden" name="name" value={w.name} />
                            <button
                              type="submit"
                              className="ot-btn-ghost ot-btn-sm"
                            >
                              再有効化
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
