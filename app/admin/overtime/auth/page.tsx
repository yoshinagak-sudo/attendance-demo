import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAdminAccess, isAdminPinRequired } from "@/lib/admin-auth";
import { PinForm } from "./pin-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function AdminOvertimeAuthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const nextPath = normalizeNext(sp.next);

  // 既に認証済なら遷移先へ即リダイレクト
  if (await hasAdminAccess()) {
    redirect(nextPath);
  }

  const pinRequired = isAdminPinRequired();

  return (
    <main className="ot-auth-shell">
      <div className="ot-auth-card">
        <h1 className="ot-auth-title">管理者認証</h1>
        <p className="ot-auth-sub">残業申請の承認に必要です</p>

        {!pinRequired && (
          <div className="ot-banner ot-banner-warn" role="status">
            <span className="ot-banner-icon" aria-hidden="true">
              !
            </span>
            <div className="ot-banner-body">
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                DEMO MODE: PIN未設定
              </div>
              <div style={{ fontSize: 12 }}>
                環境変数 <code>OVERTIME_APPROVER_PIN</code> が未設定です。
                空のまま「認証する」を押すと通過します。
              </div>
            </div>
          </div>
        )}

        <PinForm nextPath={nextPath} pinRequired={pinRequired} />

        <Link href="/admin" className="ot-auth-back">
          ← 管理ダッシュボードに戻る
        </Link>
      </div>
    </main>
  );
}

function normalizeNext(next: string | undefined): string {
  if (!next) return "/admin/overtime";
  // open redirect 防止: 内部パスのみ許可
  if (!next.startsWith("/")) return "/admin/overtime";
  if (next.startsWith("//")) return "/admin/overtime";
  return next;
}
