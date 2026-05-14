import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatJSTYmd } from "@/lib/time";
import { upsertVehicle, deactivateVehicle, reactivateVehicle } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string; error?: string }>;

export default async function AdminSettingsVehiclePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireManager("/admin/settings/vehicle");
  const sp = await searchParams;
  const saved = sp.saved === "1";
  const errorMsg = sp.error;

  const vehicles = await prisma.vehicle.findMany({
    orderBy: [{ isActive: "desc" }, { plate: "asc" }],
  });

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両マスタ</h1>
            <span className="subtitle">社用車の追加・無効化・点検期限管理</span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/admin/vehicle" className="link">一覧</Link>
            <Link href="/admin" className="link">← 管理</Link>
          </div>
        </header>

        {saved && (
          <div className="ot-banner ot-banner-success" role="status">
            <span className="ot-banner-icon" aria-hidden="true">✓</span>
            <div className="ot-banner-body">設定を保存しました</div>
          </div>
        )}
        {errorMsg && (
          <div className="ot-banner ot-banner-danger" role="alert">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-body">{errorMsg}</div>
          </div>
        )}

        <section className="ot-form-card">
          <h2 className="ot-section-title">車両を追加</h2>
          <form action={upsertVehicle} className="ot-form">
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="plate">車両番号</label>
              <input id="plate" name="plate" type="text" required placeholder="例: 宮城500あ12-34" className="ot-input" />
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="model">車種</label>
              <input id="model" name="model" type="text" required placeholder="例: ハイエース" className="ot-input" />
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="depot">所属拠点</label>
              <input id="depot" name="depot" type="text" required placeholder="例: 仙台営業所" className="ot-input" />
            </div>
            <div className="ot-field">
              <label className="ot-field-label" htmlFor="inspectionDueDate">次回点検期限（任意）</label>
              <input id="inspectionDueDate" name="inspectionDueDate" type="date" className="ot-input" />
            </div>
            <button type="submit" className="ot-btn-primary">追加</button>
          </form>
        </section>

        <section className="ot-form-card">
          <h2 className="ot-section-title">車両一覧（{vehicles.length}台）</h2>
          {vehicles.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">車両が登録されていません</div></div>
          ) : (
            <>
              <div className="table-wrap ot-site-table-wrap">
                <table className="table ot-site-table">
                  <thead>
                    <tr>
                      <th>車両</th>
                      <th>拠点</th>
                      <th>点検期限</th>
                      <th>状態</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id} className={v.isActive ? undefined : "is-inactive"}>
                        <td>
                          <strong>{v.plate}</strong>
                          <div style={{ color: "var(--muted)", fontSize: 12 }}>{v.model}</div>
                        </td>
                        <td>{v.depot}</td>
                        <td className="num">{v.inspectionDueDate ? formatJSTYmd(v.inspectionDueDate) : "—"}</td>
                        <td>
                          {v.isActive ? (
                            <span className="ot-site-badge-active">有効</span>
                          ) : (
                            <span className="ot-site-badge-inactive">無効</span>
                          )}
                        </td>
                        <td className="ot-row-actions-end">
                          <Link
                            href={`/vehicle/qr/${v.id}`}
                            className="ot-btn-ghost ot-btn-sm"
                            style={{ marginRight: 4 }}
                            target="_blank"
                          >
                            QR
                          </Link>
                          {v.isActive ? (
                            <form action={deactivateVehicle} style={{ display: "inline-flex" }}>
                              <input type="hidden" name="id" value={v.id} />
                              <button type="submit" className="ot-btn-ghost ot-btn-sm" style={{ color: "var(--warn)" }}>
                                無効化
                              </button>
                            </form>
                          ) : (
                            <form action={reactivateVehicle} style={{ display: "inline-flex" }}>
                              <input type="hidden" name="id" value={v.id} />
                              <button type="submit" className="ot-btn-ghost ot-btn-sm">
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
              <ul className="ot-site-card-list">
                {vehicles.map((v) => (
                  <li key={v.id} className={`ot-site-card${v.isActive ? "" : " is-inactive"}`}>
                    <div className="ot-site-card-main">
                      <div className="ot-site-card-name">{v.plate}</div>
                      <div className="ot-site-card-meta">
                        <span>{v.model}</span>
                        <span>{v.depot}</span>
                        {v.inspectionDueDate && <span>点検 {formatJSTYmd(v.inspectionDueDate)}</span>}
                        {v.isActive ? (
                          <span className="ot-site-badge-active">有効</span>
                        ) : (
                          <span className="ot-site-badge-inactive">無効</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <Link
                        href={`/vehicle/qr/${v.id}`}
                        className="ot-btn-ghost ot-btn-sm"
                        target="_blank"
                      >
                        QR
                      </Link>
                      {v.isActive ? (
                        <form action={deactivateVehicle}>
                          <input type="hidden" name="id" value={v.id} />
                          <button type="submit" className="ot-btn-ghost ot-btn-sm" style={{ color: "var(--warn)" }}>
                            無効化
                          </button>
                        </form>
                      ) : (
                        <form action={reactivateVehicle}>
                          <input type="hidden" name="id" value={v.id} />
                          <button type="submit" className="ot-btn-ghost ot-btn-sm">
                            再有効化
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
    </>
  );
}
