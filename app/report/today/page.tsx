import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST, formatJSTYmd, formatJSTHHmm } from "@/lib/time";
import { deriveReportDefaults } from "@/lib/daily-report";
import { TodayReportForm, type ItemDraft } from "./form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ error?: string }>;

export default async function TodayReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/report/today");
  const sp = await searchParams;
  const today = startOfTodayJST();

  const [existing, sites, todayRecords, user, drivingLogs] = await Promise.all([
    prisma.dailyReport.findUnique({
      where: { userId_reportDate: { userId: session.id, reportDate: today } },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    }),
    prisma.workSite.findMany({
      where: { isActive: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    }),
    prisma.timeRecord.findMany({
      where: {
        userId: session.id,
        timestamp: {
          gte: today,
          lt: new Date(today.getTime() + 30 * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: "asc" },
    }),
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.drivingLog.findMany({
      where: {
        userId: session.id,
        workDate: today,
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

  let items: ItemDraft[];
  let progressNote = "";
  let status: "draft" | "submitted" | "acknowledged" = "draft";
  let fromDriving = false;

  if (existing) {
    progressNote = existing.progressNote;
    status = existing.status as "draft" | "submitted" | "acknowledged";
    items = existing.items.map((it, idx) => ({
      key: it.id,
      orderIndex: idx,
      startTime: formatJSTHHmm(it.startAt),
      endTime: formatJSTHHmm(it.endAt),
      description: it.description,
      workSiteName: it.workSiteName,
      workSiteId: it.workSiteId,
    }));
  } else {
    const defaults = deriveReportDefaults({
      reportDate: today,
      user: user!,
      records: todayRecords,
      drivingLogs,
    });
    fromDriving = defaults.warnings.includes("from_driving");
    items = defaults.items.map((it, idx) => ({
      key: `init-${idx}`,
      orderIndex: idx,
      startTime: it.startTime,
      endTime: it.endTime,
      description: it.description,
      workSiteName: it.workSiteName,
      workSiteId: it.workSiteId,
    }));
  }

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">本日の日報</h1>
            <span className="subtitle">{formatJSTYmd(today)}・作業アイテムを追加して記録</span>
          </div>
          <Link href="/report" className="link">← 戻る</Link>
        </header>

        {sp.error && (
          <div className="ot-banner ot-banner-danger" role="alert">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-body">{sp.error}</div>
          </div>
        )}

        {fromDriving && (
          <div className="ot-banner ot-banner-success" role="status">
            <span className="ot-banner-icon" aria-hidden="true">✓</span>
            <div className="ot-banner-body">
              本日の車両走行ログから作業アイテムを自動で取り込みました。必要に応じて編集してください。
            </div>
          </div>
        )}

        <TodayReportForm
          reportDate={formatJSTYmd(today)}
          initialItems={items}
          initialProgressNote={progressNote}
          status={status}
          sites={sites.map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </>
  );
}
