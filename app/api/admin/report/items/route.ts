import { getSession } from "@/lib/session";
import { csvResponseHeaders, serializeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import {
  STATUS_LABEL,
  formatMinutesHm,
  assertReportStatus,
} from "@/lib/daily-report";
import {
  endOfMonthJST,
  formatJSTHHmm,
  formatJSTYmd,
  formatJSTYmdHm,
  startOfMonthJST,
} from "@/lib/time";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym");
  const statusParam = url.searchParams.get("status") ?? "submitted";
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return new Response("invalid ym", { status: 400 });
  }
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (m < 1 || m > 12) return new Response("invalid ym", { status: 400 });

  const monthStart = startOfMonthJST(y, m);
  const monthEnd = endOfMonthJST(y, m);

  const statusFilter =
    statusParam === "all"
      ? undefined
      : { in: ["submitted", "acknowledged"] };

  const reports = await prisma.dailyReport.findMany({
    where: {
      reportDate: { gte: monthStart, lt: monthEnd },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      items: { orderBy: { orderIndex: "asc" } },
      user: true,
      acknowledgedBy: true,
    },
    orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
  });

  const header = [
    "日報ID",
    "アイテムID",
    "業務日",
    "申請者",
    "状態",
    "順序",
    "開始時刻",
    "終了時刻",
    "工数（分）",
    "工数（h:mm）",
    "現場名",
    "作業内容",
    "進捗・申し送り",
    "提出時刻",
    "確認者",
    "確認時刻",
    "確認コメント",
  ];
  const rows: (string | number)[][] = [header];
  for (const r of reports) {
    const status = assertReportStatus(r.status);
    for (const it of r.items) {
      rows.push([
        r.id,
        it.id,
        formatJSTYmd(r.reportDate),
        r.user.name,
        STATUS_LABEL[status],
        it.orderIndex,
        formatJSTHHmm(it.startAt),
        formatJSTHHmm(it.endAt),
        it.durationMinutes,
        formatMinutesHm(it.durationMinutes),
        it.workSiteName,
        it.description,
        r.progressNote,
        r.submittedAt ? formatJSTYmdHm(r.submittedAt) : "",
        r.acknowledgedBy?.name ?? "",
        r.acknowledgedAt ? formatJSTYmdHm(r.acknowledgedAt) : "",
        r.ackComment ?? "",
      ]);
    }
  }

  const csv = serializeCsv(rows);
  return new Response(csv, {
    headers: csvResponseHeaders(`daily_report_items_${ym}.csv`),
  });
}

export const dynamic = "force-dynamic";
