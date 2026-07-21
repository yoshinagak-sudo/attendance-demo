import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { deriveDefaults } from "@/lib/overtime";
import {
  startOfTodayJST,
  formatJSTYmd,
  formatJSTHHmm,
} from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { OvertimeForm } from "./overtime-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ category?: string }>;

export default async function NewOvertimePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/overtime/new");
  const sp = await searchParams;
  const category: "overtime" | "holiday_work" =
    sp.category === "holiday_work" ? "holiday_work" : "overtime";

  const [workSites, setting] = await Promise.all([
    prisma.workSite.findMany({
      where: { isActive: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    }),
    prisma.appSetting.findUnique({ where: { key: "regular_end_time" } }),
  ]);

  const regularEndTime = setting?.value ?? "17:30";

  const today = startOfTodayJST();
  const records = await prisma.timeRecord.findMany({
    where: {
      userId: session.id,
      timestamp: { gte: today },
    },
    orderBy: { timestamp: "asc" },
  });

  const defaults = deriveDefaults({
    workDate: today,
    regularEndTime,
    records,
  });

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">
              {category === "holiday_work" ? "休日出勤申請" : "残業申請"} / 新規
            </h1>
            <span className="subtitle">
              申請者: <strong style={{ color: "var(--text)" }}>{session.name}</strong>
            </span>
          </div>
          <Link href={category === "holiday_work" ? "/attendance" : "/overtime"} className="link">
            ← 一覧
          </Link>
        </header>

        <OvertimeForm
          userId={session.id}
          userName={session.name}
          category={category}
          defaultWorkDate={formatJSTYmd(today)}
          defaultStartTime={formatJSTHHmm(defaults.startAt)}
          defaultEndTime={formatJSTHHmm(defaults.endAt)}
          warnings={defaults.warnings}
          regularEndTime={regularEndTime}
          workSites={workSites.map((w) => ({ id: w.id, name: w.name }))}
        />
      </main>
    </>
  );
}
