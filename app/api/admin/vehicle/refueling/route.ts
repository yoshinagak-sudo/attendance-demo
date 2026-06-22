import { getSession, isAdminRole } from "@/lib/session";
import { csvResponseHeaders, serializeCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { endOfMonthJST, formatJSTYmd, startOfMonthJST } from "@/lib/time";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym");
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    return new Response("invalid ym", { status: 400 });
  }
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (m < 1 || m > 12) return new Response("invalid ym", { status: 400 });

  const monthStart = startOfMonthJST(y, m);
  const monthEnd = endOfMonthJST(y, m);

  const records = await prisma.refuelingLog.findMany({
    where: { refuelDate: { gte: monthStart, lt: monthEnd } },
    include: { user: true, vehicle: true },
    orderBy: { refuelDate: "asc" },
  });

  const header = [
    "ログID",
    "給油日",
    "運転者",
    "車両番号",
    "給油量(L)",
    "金額(円)",
    "単価(円/L)",
    "給油所",
    "メモ",
  ];
  const rows: (string | number)[][] = [header];
  for (const r of records) {
    const unit = r.liters > 0 ? Math.floor(r.amountJpy / r.liters) : "";
    rows.push([
      r.id,
      formatJSTYmd(r.refuelDate),
      r.user.name,
      r.vehicle.plate,
      r.liters,
      r.amountJpy,
      unit,
      r.stationName,
      r.note ?? "",
    ]);
  }

  const csv = serializeCsv(rows);
  return new Response(csv, { headers: csvResponseHeaders(`refueling_${ym}.csv`) });
}

export const dynamic = "force-dynamic";
