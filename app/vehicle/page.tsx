import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST, formatJSTHHmm, formatJSTYmd } from "@/lib/time";
import {
  DRIVING_STATUS_LABEL,
  activeAssignmentsByVehicle,
  formatDistanceKm,
  formatLiters,
  formatJpy,
  type DrivingStatus,
} from "@/lib/vehicle";
import { assignVehicleSimple, releaseAssignmentSimple } from "./simple-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  assigned?: string;
  completed?: string;
  cancelled?: string;
  refueled?: string;
  released?: string;
}>;

export default async function VehicleIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/vehicle");
  const sp = await searchParams;
  const today = startOfTodayJST();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [vehicles, todayAssignments, myInProgress, myHistory, myRecentRefuels] =
    await Promise.all([
      prisma.vehicle.findMany({
        where: { isActive: true },
        orderBy: [{ plate: "asc" }],
      }),
      prisma.vehicleAssignment.findMany({
        where: { assignDate: today },
        include: { user: true },
      }),
      prisma.drivingLog.findMany({
        where: { userId: session.id, status: "in_progress" },
        orderBy: { startAt: "desc" },
        take: 3,
      }),
      prisma.drivingLog.findMany({
        where: { userId: session.id, status: "completed" },
        orderBy: { workDate: "desc" },
        take: 5,
        include: { vehicle: true },
      }),
      prisma.refuelingLog.findMany({
        where: { userId: session.id },
        orderBy: { refuelDate: "desc" },
        take: 3,
        include: { vehicle: true },
      }),
    ]);

  const activeMap = activeAssignmentsByVehicle(todayAssignments);
  const myAssignmentToday = todayAssignments.find(
    (a) => a.userId === session.id && !a.releasedAt,
  );
  const myVehicle = myAssignmentToday
    ? vehicles.find((v) => v.id === myAssignmentToday.vehicleId)
    : null;
  const myInProgressForMyVehicle = myVehicle
    ? myInProgress.find((d) => d.vehicleId === myVehicle.id)
    : null;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両管理</h1>
            <span className="subtitle">割当→出発→帰着の順に登録。給油も記録できます</span>
          </div>
          <Link href="/" className="link">← 打刻画面</Link>
        </header>

        {sp.assigned && (
          <div className="ot-toast" role="status">車両を割り当てました</div>
        )}
        {sp.completed && (
          <div className="ot-toast" role="status">帰着を登録しました</div>
        )}
        {sp.cancelled && (
          <div className="ot-toast" role="status">走行を取り消しました</div>
        )}
        {sp.refueled && (
          <div className="ot-toast" role="status">給油を登録しました</div>
        )}
        {sp.released && (
          <div className="ot-toast" role="status">割当を解除しました</div>
        )}

        <section className="section" aria-labelledby="vh-my-heading">
          <div className="section-head">
            <h2 id="vh-my-heading" className="section-title">今日の自分の車両</h2>
            <span className="section-sub">{formatJSTYmd(today)}</span>
          </div>
          {myVehicle ? (
            <div className="vh-mycard card">
              <div className="vh-mycard-head">
                <span className="vh-plate-strong">{myVehicle.plate}</span>
                <span className="vh-model">{myVehicle.model}</span>
              </div>
              <div className="vh-mycard-meta">{myVehicle.depot}</div>
              {myInProgressForMyVehicle ? (
                <div className="vh-progress-block">
                  <div className="vh-progress-line">
                    <span className="badge vh-badge-in-progress">進行中</span>
                    <span className="num">{formatJSTHHmm(myInProgressForMyVehicle.startAt)} 出発</span>
                  </div>
                  <div className="vh-progress-detail">
                    {myInProgressForMyVehicle.workSiteName}・{myInProgressForMyVehicle.purpose}
                  </div>
                  <Link
                    href={`/vehicle/driving/${myInProgressForMyVehicle.id}`}
                    className="ot-btn-primary ot-btn-lg ot-btn-block"
                  >
                    帰着を登録する
                  </Link>
                </div>
              ) : (
                <div className="vh-cta-row">
                  <Link
                    href={`/vehicle/driving/start?vehicleId=${myVehicle.id}`}
                    className="ot-btn-primary ot-btn-lg ot-btn-block"
                  >
                    出発を登録する
                  </Link>
                  <Link
                    href={`/vehicle/refueling/new?vehicleId=${myVehicle.id}`}
                    className="ot-btn-ghost ot-btn-lg ot-btn-block"
                  >
                    給油を登録する
                  </Link>
                </div>
              )}
              <form action={releaseAssignmentSimple} className="vh-release-form">
                <input type="hidden" name="id" value={myAssignmentToday?.id ?? ""} />
                <button type="submit" className="link vh-release-btn">割当を解除する</button>
              </form>
            </div>
          ) : (
            <div className="ot-empty">
              <div className="ot-empty-title">本日の割当はありません</div>
              <div>下から「使う」を押して車両を割り当ててください</div>
            </div>
          )}
        </section>

        <section className="section" aria-labelledby="vh-list-heading">
          <div className="section-head">
            <h2 id="vh-list-heading" className="section-title">割当可能な車両</h2>
            <span className="section-sub tabular">全 {vehicles.length} 台</span>
          </div>
          <div className="vh-vehicle-list">
            {vehicles.map((v) => {
              const ass = activeMap.get(v.id);
              const isMine = ass?.userId === session.id;
              return (
                <div key={v.id} className={`vh-vehicle-card card${ass ? " is-assigned" : ""}`}>
                  <div className="vh-vehicle-head">
                    <span className="vh-plate-strong">{v.plate}</span>
                    <span className="vh-model">{v.model}</span>
                  </div>
                  <div className="vh-vehicle-meta">
                    <span>{v.depot}</span>
                    {v.inspectionDueDate && (
                      <span style={{ color: "var(--muted)" }}>
                        点検期限 {formatJSTYmd(v.inspectionDueDate)}
                      </span>
                    )}
                  </div>
                  <div className="vh-vehicle-status">
                    {ass ? (
                      isMine ? (
                        <span className="badge vh-badge-mine">あなたが使用中</span>
                      ) : (
                        <span className="badge vh-badge-busy">{ass.userName} さんが使用中</span>
                      )
                    ) : (
                      <span className="badge vh-badge-free">空き</span>
                    )}
                  </div>
                  {!ass && (
                    <form action={assignVehicleSimple}>
                      <input type="hidden" name="vehicleId" value={v.id} />
                      <button type="submit" className="ot-btn-primary ot-btn-block">
                        この車両を使う
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="section" aria-labelledby="vh-history-heading">
          <div className="section-head">
            <h2 id="vh-history-heading" className="section-title">最近の自分の走行</h2>
            <Link href="/vehicle/history" className="link">すべて見る</Link>
          </div>
          {myHistory.length === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">走行記録はまだありません</div>
            </div>
          ) : (
            <div className="vh-history-list">
              {myHistory.map((d) => (
                <Link key={d.id} href={`/vehicle/driving/${d.id}`} className="vh-history-row">
                  <div className="vh-history-main">
                    <div className="vh-history-top">
                      <span className="vh-plate-small">{d.vehicle.plate}</span>
                      <span className="vh-history-purpose">{d.purpose}</span>
                    </div>
                    <div className="vh-history-detail">{d.workSiteName}</div>
                    <div className="vh-history-time">
                      {formatJSTYmd(d.workDate)}・{formatJSTHHmm(d.startAt)}〜{d.endAt ? formatJSTHHmm(d.endAt) : "—"}・{formatDistanceKm(d.distanceKm)}
                    </div>
                  </div>
                  <span className={`badge vh-badge-${(d.status as DrivingStatus)}`}>
                    {DRIVING_STATUS_LABEL[d.status as DrivingStatus]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {myRecentRefuels.length > 0 && (
          <section className="section" aria-labelledby="vh-refuel-heading">
            <div className="section-head">
              <h2 id="vh-refuel-heading" className="section-title">最近の給油</h2>
            </div>
            <div className="vh-refuel-list">
              {myRecentRefuels.map((r) => (
                <div key={r.id} className="vh-refuel-row">
                  <div className="vh-refuel-main">
                    <span className="vh-plate-small">{r.vehicle.plate}</span>
                    <span>{r.stationName}</span>
                  </div>
                  <div className="vh-refuel-sub">
                    {formatJSTYmd(r.refuelDate)}・{formatLiters(r.liters)}・{formatJpy(r.amountJpy)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
