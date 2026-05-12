import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // 既にログイン済なら next or / に飛ばす
  const session = await getSession();
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  if (session) {
    redirect(next);
  }

  return (
    <main className="login-shell">
      <div className="login-brand">
        <span className="brand-mark" aria-hidden="true">BF</span>
        <h1 className="login-brand-title">勤怠アプリ</h1>
        <span className="login-brand-sub">舞台ファーム</span>
      </div>
      <LoginForm next={next} />
    </main>
  );
}

/**
 * オープンリダイレクト防止。
 * 同一オリジン内（`/` で始まる、ただし `//` や `/\\` は除く）のみ許可。
 */
function sanitizeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
