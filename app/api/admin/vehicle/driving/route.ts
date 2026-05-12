import { getSession } from "@/lib/session";
import { csvResponseHeaders, serializeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { DRIVING_STATUS_LABEL, assertDrivingStatus } from "@/lib/vehicle";
import {
  endOfMonthJST,
  formatJSTHHmm,
  formatJSTYmd,
  startOfMonthJST,
} from "@/lib/time";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "manager") {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym");
  const statusParam = url.searchParams.get("status") ?? "completed";
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
    ...(statusParam === "all" ? {} : { status: "completed" }),
  };

  const records = await prisma.drivingLog.findMany({
    where,
    include: { user: true, vehicle: true },
    orderBy: [{ workDate: "asc" }, { startAt: "asc" }],
  });

  const header = [
    "ログID",
    "業務日",
    "運転者",
    "車両番号",
    "車種",
    "目的",
    "現場名",
    "出発時刻",
    "帰着時刻",
    "出発メーター",
    "帰着メーター",
    "走行距離(km)",
    "状態",
  ];

  const rows: (string | number)[][] = [header];
  for (const r of records) {
    const status = assertDrivingStatus(r.status);
    rows.push([
      r.id,
      formatJSTYmd(r.workDate),
      r.user.name,
      r.vehicle.plate,
      r.vehicle.model,
      r.purpose,
      r.workSiteName,
      formatJSTHHmm(r.startAt),
      r.endAt ? formatJSTHHmm(r.endAt) : "",
      r.startOdometer,
      r.endOdometer ?? "",
      r.distanceKm ?? "",
      DRIVING_STATUS_LABEL[status],
    ]);
  }

  const csv = serializeCsv(rows);
  return new Response(csv, { headers: csvResponseHeaders(`driving_${ym}.csv`) });
}

export const dynamic = "force-dynamic";
