import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST, formatJSTHHmm, formatJSTYmd } from "@/lib/time";
import {
  DRIVING_STATUS_LABEL,
  allVehicleAlertsWithin,
  ALERT_LABEL,
  formatDistanceKm,
  type DrivingStatus,
} from "@/lib/vehicle";

export const dynamic = "force-dynamic";

export default async function AdminVehiclePage() {
  const session = await requireManager("/admin/vehicle");
  const today = startOfTodayJST();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [vehicles, inProgress, todayCompleted] = await Promise.all([
    prisma.vehicle.findMany({ orderBy: [{ isActive: "desc" }, { plate: "asc" }] }),
    prisma.drivingLog.findMany({
      where: { status: "in_progress" },
      include: { user: true, vehicle: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.drivingLog.findMany({
      where: {
        status: "completed",
        workDate: today,
      },
      include: { user: true, vehicle: true },
      orderBy: { endAt: "desc" },
    }),
  ]);

  const alerts = allVehicleAlertsWithin({ vehicles });
  const hasCritical = alerts.some((a) => a.daysLeft < 0 || a.daysLeft <= 7);

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両管理</h1>
            <span className="subtitle">{formatJSTYmd(today)}・進行中・点検/車検アラート</span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/admin/vehicle/report" className="link">月次レポート</Link>
            <Link href="/admin/settings/vehicle" className="link">車両マスタ</Link>
            <Link href="/admin" className="link">← 管理</Link>
          </div>
        </header>

        {alerts.length > 0 && (
          <div className={`ot-banner ${hasCritical ? "ot-banner-danger" : "ot-banner-warn"}`} role="alert">
            <span className="ot-banner-icon" aria-hidden="true">⚠</span>
            <div className="ot-banner-body">
              <strong>点検・車検の期限が近い車両があります</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {alerts.slice(0, 6).map((a, idx) => {
                  const badge = a.kind === "vehicleInspection" ? "車検" : "点検";
                  const badgeColor = a.kind === "vehicleInspection" ? "var(--danger)" : "var(--warn)";
                  return (
                    <li key={`${a.vehicle.id}-${a.kind}`}>
                      <span style={{
                        display: "inline-block",
                        minWidth: 36,
                        textAlign: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background: badgeColor,
                        padding: "1px 6px",
                        borderRadius: 4,
                        marginRight: 6,
                      }}>{badge}</span>
                      {a.vehicle.plate}（{a.vehicle.model}）
                      {a.daysLeft < 0
                        ? ` — ${Math.abs(a.daysLeft)}日超過`
                        : a.daysLeft === 0
                          ? " — 本日が期限"
                          : ` — あと ${a.daysLeft} 日`}
                    </li>
                  );
                })}
                {alerts.length > 6 && <li>他 {alerts.length - 6} 件</li>}
              </ul>
            </div>
          </div>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">進行中の走行</h2>
            <span className="section-sub tabular">{inProgress.length} 件</span>
          </div>
          {inProgress.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">進行中の走行はありません</div></div>
          ) : (
            <div className="vh-history-list">
              {inProgress.map((d) => {
                const elapsed = Date.now() - d.startAt.getTime();
                const isLong = elapsed > 24 * 60 * 60 * 1000;
                return (
                  <Link key={d.id} href={`/vehicle/driving/${d.id}`} className={`vh-history-row${isLong ? " is-warn" : ""}`}>
                    <div className="vh-history-main">
                      <div className="vh-history-top">
                        <span className="vh-plate-small">{d.vehicle.plate}</span>
                        <span className="vh-history-purpose">{d.user.name}・{d.purpose}</span>
                      </div>
                      <div className="vh-history-detail">{d.workSiteName}</div>
                      <div className="vh-history-time">
                        {formatJSTYmd(d.workDate)}・出発 {formatJSTHHmm(d.startAt)}
                        {isLong && <span style={{ color: "var(--warn)", marginLeft: 8 }}>⚠ 24時間以上経過</span>}
                      </div>
                    </div>
                    <span className="badge vh-badge-in_progress">進行中</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">本日の完了走行</h2>
            <span className="section-sub tabular">{todayCompleted.length} 件</span>
          </div>
          {todayCompleted.length === 0 ? (
            <div className="ot-empty"><div className="ot-empty-title">本日完了の走行はまだありません</div></div>
          ) : (
            <div className="vh-history-list">
              {todayCompleted.map((d) => (
                <Link key={d.id} href={`/vehicle/driving/${d.id}`} className="vh-history-row">
                  <div className="vh-history-main">
                    <div className="vh-history-top">
                      <span className="vh-plate-small">{d.vehicle.plate}</span>
                      <span className="vh-history-purpose">{d.user.name}・{d.purpose}</span>
                    </div>
                    <div className="vh-history-detail">{d.workSiteName}</div>
                    <div className="vh-history-time">
                      {formatJSTHHmm(d.startAt)}〜{d.endAt ? formatJSTHHmm(d.endAt) : "—"}・{formatDistanceKm(d.distanceKm)}
                    </div>
                  </div>
                  <span className="badge vh-badge-completed">完了</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
