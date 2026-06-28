import { unstable_noStore as noStore } from "next/cache";
import { Truck, Activity, AlertTriangle } from "lucide-react";
import { requireDashboardSession } from "../_lib/require-dashboard";
import { getVehicleStatus } from "../_lib/data";

export const dynamic = "force-dynamic";

function formatJstDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type InspectionStatus =
  | { kind: "ok"; daysRemain: number | null }
  | { kind: "warn"; daysRemain: number }
  | { kind: "expired"; daysOver: number }
  | { kind: "missing" };

function evaluateInspection(due: Date | null, now: Date): InspectionStatus {
  if (!due) return { kind: "missing" };
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((due.getTime() - now.getTime()) / msPerDay);
  if (diff < 0) return { kind: "expired", daysOver: -diff };
  if (diff <= 30) return { kind: "warn", daysRemain: diff };
  return { kind: "ok", daysRemain: diff };
}

export default async function VehiclePage() {
  noStore();
  await requireDashboardSession();
  const data = await getVehicleStatus();
  const now = new Date();

  // 警告(車検期限近い/超過) を先頭、そのあと使用中→未使用、で並べる
  const sorted = [...data.vehicles].sort((a, b) => {
    const sa = evaluateInspection(a.inspectionDueDate, now);
    const sb = evaluateInspection(b.inspectionDueDate, now);
    const wa = sa.kind === "expired" ? 0 : sa.kind === "warn" ? 1 : 2;
    const wb = sb.kind === "expired" ? 0 : sb.kind === "warn" ? 1 : 2;
    if (wa !== wb) return wa - wb;
    const inUseA = a.assignedUserName ? 0 : 1;
    const inUseB = b.assignedUserName ? 0 : 1;
    if (inUseA !== inUseB) return inUseA - inUseB;
    return a.plate.localeCompare(b.plate);
  });

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">車両状況</span>
          <h1 className="dash-page-title">車両状況</h1>
          <span className="dash-page-sub">車検期限と稼働状況</span>
        </div>
      </header>

      <section
        className="dash-cards dash-cards-3"
        aria-label="車両サマリ"
      >
        <article className="dash-card">
          <div className="dash-card-head">
            <Truck aria-hidden="true" />
            総数
          </div>
          <div className="dash-card-value">
            {data.total}
            <span className="dash-card-unit">台</span>
          </div>
          <div className="dash-card-note">登録された全車両</div>
        </article>

        <article className="dash-card dash-card-accent">
          <div className="dash-card-head">
            <Activity aria-hidden="true" />
            使用中
          </div>
          <div className="dash-card-value">
            {data.inUse}
            <span className="dash-card-unit">台</span>
          </div>
          <div className="dash-card-note">
            待機中 {Math.max(data.total - data.inUse, 0)} 台
          </div>
        </article>

        <article
          className={`dash-card${
            data.alerts > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <AlertTriangle aria-hidden="true" />
            車検警告
          </div>
          <div className="dash-card-value">
            {data.alerts}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">期限まで30日以内 / 既に経過</div>
        </article>
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="dash-section-title">車両一覧</h2>
          <span className="dash-section-sub">{data.vehicles.length} 台</span>
        </div>

        {data.vehicles.length === 0 ? (
          <div className="dash-empty">登録車両がありません</div>
        ) : (
          <div className="dash-table-wrap">
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th scope="col">プレート</th>
                    <th scope="col">モデル</th>
                    <th scope="col">拠点</th>
                    <th scope="col">使用者</th>
                    <th scope="col">車検期限</th>
                    <th scope="col">直近30日 走行</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((v) => {
                    const status = evaluateInspection(
                      v.inspectionDueDate,
                      now,
                    );
                    return (
                      <tr key={v.id}>
                        <td className="dash-td-name">{v.plate}</td>
                        <td>{v.model || <span className="dash-td-muted">—</span>}</td>
                        <td>
                          {v.depot || (
                            <span className="dash-td-muted">—</span>
                          )}
                        </td>
                        <td>
                          {v.assignedUserName ? (
                            <span className="dash-badge dash-badge-working">
                              {v.assignedUserName}
                            </span>
                          ) : (
                            <span className="dash-badge dash-badge-notyet">
                              待機
                            </span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            <span
                              className={
                                status.kind === "expired"
                                  ? "dash-td-num dash-td-danger"
                                  : status.kind === "warn"
                                    ? "dash-td-num dash-td-warn"
                                    : "dash-td-num"
                              }
                            >
                              {formatJstDate(v.inspectionDueDate)}
                            </span>
                            {status.kind === "expired" ? (
                              <span className="dash-badge dash-badge-danger">
                                {status.daysOver}日経過
                              </span>
                            ) : status.kind === "warn" ? (
                              <span className="dash-badge dash-badge-warn">
                                残{status.daysRemain}日
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="dash-td-num">
                          {v.recentKm > 0 ? (
                            <>
                              {Math.round(v.recentKm).toLocaleString()}
                              <span className="dash-td-muted"> km</span>
                            </>
                          ) : (
                            <span className="dash-td-muted">—</span>
                          )}
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
    </>
  );
}
