import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { headers } from "next/headers";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function VehicleQrPage({ params }: { params: Params }) {
  await requireManager("/admin/settings/vehicle");
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) notFound();

  const hdr = await headers();
  const host = hdr.get("host") ?? "attendance-ninau.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const url = `${proto}://${host}/vehicle/assign?vid=${vehicle.id}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 360 });

  return (
    <main className="qr-print-page">
      <style>{`
        @page { size: A6 portrait; margin: 8mm; }
        body { background: white; }
        .qr-print-page {
          max-width: 320px;
          margin: 16mm auto;
          padding: 16px;
          text-align: center;
          font-family: "Zen Kaku Gothic New", "Hiragino Sans", sans-serif;
          background: white;
        }
        .qr-print-page h1 {
          font-size: 22px;
          font-weight: 900;
          margin: 0 0 4px;
        }
        .qr-print-page .meta {
          font-size: 12px;
          color: #6b7763;
          margin-bottom: 10px;
        }
        .qr-print-page .svg-wrap svg {
          width: 240px;
          height: 240px;
        }
        .qr-print-page .caption {
          font-size: 11px;
          color: #6b7763;
          margin-top: 8px;
          line-height: 1.5;
        }
        .qr-actions { margin-top: 20px; }
        @media print {
          .qr-actions { display: none; }
        }
      `}</style>
      <h1>{vehicle.plate}</h1>
      <div className="meta">{vehicle.model}・{vehicle.depot}</div>
      <div className="svg-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="caption">
        スマホでスキャン → 自動で割当画面へ
        <br />
        ニナウ勤怠アプリ
      </div>
      <div className="qr-actions">
        <PrintButton />
        <Link href="/admin/settings/vehicle" className="link" style={{ marginLeft: 12 }}>← 戻る</Link>
      </div>
    </main>
  );
}
