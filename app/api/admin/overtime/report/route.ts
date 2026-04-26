import { hasAdminAccess } from "@/lib/admin-auth";
import { csvResponseHeaders, serializeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import {
  REQUEST_TYPE_LABEL,
  STATUS_LABEL,
  assertOvertimeStatus,
  assertRequestType,
  formatDuration,
} from "@/lib/overtime";
import {
  endOfMonthJST,
  formatJSTHHmm,
  formatJSTYmd,
  formatJSTYmdHm,
  startOfMonthJST,
} from "@/lib/time";

export async function GET(req: Request) {
  if (!(await hasAdminAccess())) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym");
  const statusParam = url.searchParams.get("status") ?? "approved";

  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return new Response("invalid ym", { status: 400 });
  }
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (m < 1 || m > 12) return new Response("invalid ym", { status: 400 });

  const monthStart = startOfMonthJST(y, m);
  const monthEnd = endOfMonthJST(y, m);

  const where = {
    workDate: { gte: monthStart, lt: monthEnd },
    ...(statusParam === "all" ? {} : { status: "approved" }),
  };

  const records = await prisma.overtimeRequest.findMany({
    where,
    include: { user: true, reviewer: true },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  const header = [
    "申請ID",
    "業務日",
    "申請者",
    "申請種別",
    "状態",
    "開始時刻",
    "終了時刻",
    "残業時間（分）",
    "残業時間（h:mm）",
    "現場名",
    "作業内容",
    "承認者",
    "承認日時",
    "差戻コメント",
  ];

  const rows: (string | number)[][] = [header];
  for (const r of records) {
    const status = assertOvertimeStatus(r.status);
    const requestType = assertRequestType(r.requestType);
    rows.push([
      r.id,
      formatJSTYmd(r.workDate),
      r.user.name,
      REQUEST_TYPE_LABEL[requestType],
      STATUS_LABEL[status],
      formatJSTHHmm(r.startAt),
      formatJSTHHmm(r.endAt),
      r.durationMinutes,
      formatDuration(r.durationMinutes),
      r.workSiteName,
      r.description,
      r.reviewer?.name ?? "",
      r.reviewedAt ? formatJSTYmdHm(r.reviewedAt) : "",
      r.reviewComment ?? "",
    ]);
  }

  const csv = serializeCsv(rows);
  return new Response(csv, {
    headers: csvResponseHeaders(`overtime_${ym}.csv`),
  });
}

export const dynamic = "force-dynamic";
