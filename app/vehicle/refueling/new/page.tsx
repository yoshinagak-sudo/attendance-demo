import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { formatJSTYmd, startOfTodayJST } from "@/lib/time";
import { RefuelingForm } from "./form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ vehicleId?: string }>;

export default async function NewRefuelingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/vehicle/refueling/new");
  const sp = await searchParams;
  const today = startOfTodayJST();

  const vehicles = await prisma.vehicle.findMany({
    where: { isActive: true },
    orderBy: { plate: "asc" },
  });

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">給油登録</h1>
            <span className="subtitle">給油記録は車両ごとに月次集計されます</span>
          </div>
          <Link href="/vehicle" className="link">← 戻る</Link>
        </header>

        <RefuelingForm
          vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plate, model: v.model }))}
          defaultVehicleId={sp.vehicleId ?? null}
          defaultDate={formatJSTYmd(today)}
        />
      </main>
    </>
  );
}
