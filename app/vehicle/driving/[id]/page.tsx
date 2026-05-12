import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatJSTHHmm, formatJSTYmd } from "@/lib/time";
import {
  DRIVING_STATUS_LABEL,
  formatDistanceKm,
  type DrivingStatus,
} from "@/lib/vehicle";
import { FinishDrivingForm } from "./finish-form";
import { cancelDriving } from "@/app/vehicle/actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function DrivingDetailPage({ params }: { params: Params }) {
  const session = await requireSession("/vehicle");
  const { id } = await params;
  const log = await prisma.drivingLog.findUnique({
    where: { id },
    include: { vehicle: true, user: true, workSite: true },
  });
  if (!log) notFound();

  const isMine = log.userId === session.id;
  const canEdit = isMine && log.status === "in_progress";
  const canCancel = isMine && log.status === "in_progress" &&
    Date.now() - log.createdAt.getTime() <= 5 * 60 * 1000;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">走行詳細</h1>
            <span className="subtitle">
              {log.vehicle.plate} ・ {log.vehicle.model}
            </span>
          </div>
          <Link href="/vehicle" className="link">← 戻る</Link>
        </header>

        <div className="ot-detail-card card">
          <div className="ot-detail-row">
            <span className="ot-detail-label">状態</span>
            <span className={`badge vh-badge-${log.status as DrivingStatus}`}>
              {DRIVING_STATUS_LABEL[log.status as DrivingStatus]}
            </span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">業務日</span>
            <span className="num">{formatJSTYmd(log.workDate)}</span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">運転者</span>
            <span>{log.user.name}</span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">目的</span>
            <span>{log.purpose}</span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">現場</span>
            <span>{log.workSiteName}</span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">出発</span>
            <span>
              {formatJSTHHmm(log.startAt)}・
              <span className="num">{log.startOdometer.toLocaleString()}</span> km
            </span>
          </div>
          <div className="ot-detail-row">
            <span className="ot-detail-label">帰着</span>
            <span>
              {log.endAt ? formatJSTHHmm(log.endAt) : "—"}・
              {log.endOdometer !== null ? (
                <>
                  <span className="num">{log.endOdometer.toLocaleString()}</span> km
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
          {log.distanceKm !== null && (
            <div className="ot-detail-row">
              <span className="ot-detail-label">走行距離</span>
              <span className="num">{formatDistanceKm(log.distanceKm)}</span>
            </div>
          )}
        </div>

        {canEdit && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">帰着を登録</h2>
            </div>
            <FinishDrivingForm
              drivingLogId={log.id}
              startOdometer={log.startOdometer}
            />
          </section>
        )}

        {canCancel && (
          <form action={cancelDriving} style={{ marginTop: 16 }}>
            <input type="hidden" name="drivingLogId" value={log.id} />
            <button type="submit" className="link" style={{ color: "var(--danger)" }}>
              この走行を取り消す（出発から5分以内のみ）
            </button>
          </form>
        )}
      </main>
    </>
  );
}
