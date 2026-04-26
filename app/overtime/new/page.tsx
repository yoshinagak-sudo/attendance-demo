import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deriveDefaults } from "@/lib/overtime";
import {
  startOfTodayJST,
  formatJSTYmd,
  formatJSTHHmm,
} from "@/lib/time";
import { OvertimeForm } from "./overtime-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ actor?: string }>;

export default async function NewOvertimePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const actorId = params.actor?.trim() || "";

  const [users, workSites, setting] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.workSite.findMany({
      where: { isActive: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    }),
    prisma.appSetting.findUnique({ where: { key: "regular_end_time" } }),
  ]);

  const regularEndTime = setting?.value ?? "17:30";
  const currentActor = actorId ? users.find((u) => u.id === actorId) : null;

  // 申請者未指定: エントリ画面に戻すヒント
  if (!currentActor) {
    return (
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">残業申請 / 新規</h1>
            <span className="subtitle">申請者を選んでから入力してください</span>
          </div>
          <Link href="/overtime" className="link">
            ← 残業申請トップ
          </Link>
        </header>
        <div className="ot-empty">
          <div className="ot-empty-title">申請者が選択されていません</div>
          <div>
            <Link href="/overtime" className="ot-btn-secondary" style={{ marginTop: 12 }}>
              申請者を選択する
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const today = startOfTodayJST();
  const records = await prisma.timeRecord.findMany({
    where: {
      userId: currentActor.id,
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
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">残業申請 / 新規</h1>
          <span className="subtitle">
            申請者: <strong style={{ color: "var(--text)" }}>{currentActor.name}</strong>
          </span>
        </div>
        <Link
          href={`/overtime?actor=${encodeURIComponent(currentActor.id)}`}
          className="link"
        >
          ← 残業申請トップ
        </Link>
      </header>

      <OvertimeForm
        userId={currentActor.id}
        userName={currentActor.name}
        defaultWorkDate={formatJSTYmd(today)}
        defaultStartTime={formatJSTHHmm(defaults.startAt)}
        defaultEndTime={formatJSTHHmm(defaults.endAt)}
        warnings={defaults.warnings}
        regularEndTime={regularEndTime}
        workSites={workSites.map((w) => ({ id: w.id, name: w.name }))}
      />
    </main>
  );
}
