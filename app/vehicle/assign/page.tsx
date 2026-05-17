import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ vid?: string }>;

// 「事前割当」フローを廃止。QRコード等から飛んできた場合は出発登録に直接遷移する。
export default async function AssignRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const vid = sp.vid ?? "";
  if (vid) {
    redirect(`/vehicle/driving/start?vehicleId=${vid}`);
  }
  redirect("/vehicle");
}
