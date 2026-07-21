import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  ATTENDANCE_CATEGORIES,
  CATEGORY_LABEL,
  type AttendanceCategory,
  DEFAULT_SPECIAL_LEAVE_REASONS,
  SUBSTITUTE_PICK_WINDOW_DAYS,
} from "@/lib/attendance-request";
import { computePaidLeaveBalance } from "@/lib/paid-leave";
import { AppHeader } from "@/app/_components/AppHeader";
import { AttendanceForm } from "./attendance-form";
import { formatJSTYmd } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = Promise<{ category: string }>;
type SearchParams = Promise<{ parentId?: string }>;

export default async function AttendanceNewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await requireSession("/attendance");
  const { category: raw } = await params;
  const sp = await searchParams;
  if (!(ATTENDANCE_CATEGORIES as readonly string[]).includes(raw)) notFound();
  const category = raw as AttendanceCategory;

  // 再申請時: parent が「本人・sent_back・同一 category」であるか確認
  let parentId: string | null = null;
  if (sp.parentId) {
    const parent = await prisma.attendanceRequest.findUnique({
      where: { id: sp.parentId },
      select: { id: true, userId: true, status: true, category: true },
    });
    if (
      parent &&
      parent.userId === session.id &&
      parent.status === "sent_back" &&
      parent.category === category
    ) {
      parentId = parent.id;
    }
  }

  // カテゴリ別に必要な補助データを引く
  const user = await prisma.user.findUnique({ where: { id: session.id } });

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "default_scheduled_start_time",
          "regular_end_time",
          "special_leave_reason_suggest",
          "am_half_end_time",
          "pm_half_start_time",
        ],
      },
    },
  });
  const sMap: Record<string, string> = Object.fromEntries(
    settings.map((s) => [s.key, s.value]),
  );
  const defaultScheduledStart =
    user?.defaultScheduledStartTime ??
    sMap.default_scheduled_start_time ??
    "08:00";
  const defaultScheduledEnd =
    user?.defaultScheduledEndTime ?? sMap.regular_end_time ?? "17:30";
  const reasonSuggestRaw =
    sMap.special_leave_reason_suggest ?? DEFAULT_SPECIAL_LEAVE_REASONS.join("|");
  const reasonSuggest = reasonSuggestRaw.split("|").map((s) => s.trim()).filter(Boolean);

  // 有給の残日数（paid_leave カテゴリのときだけ）
  let paidLeaveRemaining: number | null = null;
  if (category === "paid_leave") {
    const [grants, cons] = await Promise.all([
      prisma.paidLeaveGrant.findMany({ where: { userId: session.id } }),
      prisma.attendanceRequest.findMany({
        where: {
          userId: session.id,
          category: "paid_leave",
          status: { in: ["submitted", "approved"] },
        },
        select: { id: true, workDate: true, leaveDays: true, status: true },
      }),
    ]);
    const balance = computePaidLeaveBalance(
      grants.map((g) => ({ id: g.id, grantedOn: g.grantedOn, expiresOn: g.expiresOn, days: g.days })),
      cons.map((c) => ({
        id: c.id,
        workDate: c.workDate,
        leaveDays: c.leaveDays ?? 0,
        status: c.status as "submitted" | "approved",
      })),
    );
    paidLeaveRemaining = balance.remaining;
  }

  // 振替休暇: 過去90日以内の自分の承認済 holiday_work を候補として渡す
  let substituteCandidates: { id: string; workDate: string; siteName: string }[] = [];
  if (category === "substitute_leave") {
    const windowStart = new Date(
      Date.now() - SUBSTITUTE_PICK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await prisma.overtimeRequest.findMany({
      where: {
        userId: session.id,
        category: "holiday_work",
        status: "approved",
        workDate: { gte: windowStart },
      },
      orderBy: { workDate: "desc" },
      take: 30,
    });
    substituteCandidates = rows.map((r) => ({
      id: r.id,
      workDate: formatJSTYmd(r.workDate),
      siteName: r.workSiteName,
    }));
  }

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">{CATEGORY_LABEL[category]} 申請</h1>
            <span className="subtitle">
              対象日と種別を選んで提出してください
            </span>
          </div>
          <Link href="/attendance" className="link">
            ← 申請一覧
          </Link>
        </header>

        <AttendanceForm
          category={category}
          userId={session.id}
          parentId={parentId}
          defaultScheduledStart={defaultScheduledStart}
          defaultScheduledEnd={defaultScheduledEnd}
          reasonSuggest={reasonSuggest}
          paidLeaveRemaining={paidLeaveRemaining}
          substituteCandidates={substituteCandidates}
        />
      </main>
    </>
  );
}
