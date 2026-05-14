import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { AppHeader } from "@/app/_components/AppHeader";
import { startOfTodayJST } from "@/lib/time";
import { assignVehicleSimple } from "@/app/vehicle/simple-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ vid?: string }>;

export default async function AssignFromQrPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession("/vehicle/assign");
  const sp = await searchParams;
  const vid = sp.vid ?? "";
  const today = startOfTodayJST();

  const vehicle = vid
    ? await prisma.vehicle.findUnique({ where: { id: vid } })
    : null;

  const currentActive = vid
    ? await prisma.vehicleAssignment.findFirst({
        where: { vehicleId: vid, releasedAt: null, assignDate: today },
        include: { user: true },
      })
    : null;

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">車両の割当</h1>
            <span className="subtitle">QRコードから読み取られた車両を確認</span>
          </div>
          <Link href="/vehicle" className="link">← 戻る</Link>
        </header>

        {!vehicle ? (
          <div className="ot-banner ot-banner-danger">
            <span className="ot-banner-icon" aria-hidden="true">!</span>
            <div className="ot-banner-body">
              QRコードが正しく読み取れませんでした。車両が見つかりません。
            </div>
          </div>
        ) : !vehicle.isActive ? (
          <div className="ot-banner ot-banner-danger">
            <div className="ot-banner-body">この車両は無効化されています。</div>
          </div>
        ) : (
          <div className="vh-mycard card">
            <div className="vh-mycard-head">
              <span className="vh-plate-strong">{vehicle.plate}</span>
              <span className="vh-model">{vehicle.model}</span>
            </div>
            <div className="vh-mycard-meta">{vehicle.depot}</div>

            {currentActive ? (
              currentActive.userId === session.id ? (
                <>
                  <div className="ot-banner ot-banner-success">
                    <span className="ot-banner-icon" aria-hidden="true">✓</span>
                    <div className="ot-banner-body">
                      すでにあなたが使用中の車両です
                    </div>
                  </div>
                  <Link
                    href={`/vehicle/driving/start?vehicleId=${vehicle.id}`}
                    className="ot-btn-primary ot-btn-lg ot-btn-block"
                  >
                    出発を登録する
                  </Link>
                </>
              ) : (
                <div className="ot-banner ot-banner-warn">
                  <span className="ot-banner-icon" aria-hidden="true">⚠</span>
                  <div className="ot-banner-body">
                    現在 {currentActive.user.name} さんが使用中です。
                    引き継ぐ場合は下のボタンで割当を上書きできます。
                  </div>
                </div>
              )
            ) : (
              <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 12px" }}>
                この車両を本日（{today.toLocaleDateString("ja-JP")}）あなたの担当として割当します
              </p>
            )}

            {(!currentActive || currentActive.userId !== session.id) && (
              <form action={assignVehicleSimple}>
                <input type="hidden" name="vehicleId" value={vehicle.id} />
                <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block">
                  この車両を使う
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </>
  );
}
