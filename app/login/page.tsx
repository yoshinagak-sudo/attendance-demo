import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import { QuickLogin } from "./quick-login";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  const params = await searchParams;
  const requestedNext = sanitizeNext(params.next);
  const lineError = resolveLineError(params.error);

  if (session) {
    const fallback =
      session.role === "manager" || session.role === "developer" ? "/admin" : "/";
    const target = requestedNext === "/" ? fallback : requestedNext;
    redirect(target);
  }

  const demoMode =
    process.env.DEMO_MODE === "1" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "1";

  return (
    <main className="login-shell">
      <div className="login-brand">
        <img
          src="/ninau-logo.png"
          alt="株式会社ニナウ"
          className="login-brand-logo"
          width={546}
          height={136}
        />
        <h1 className="login-brand-title">勤怠アプリ</h1>
      </div>
      {demoMode ? (
        <QuickLogin next={requestedNext} />
      ) : (
        <LoginForm next={requestedNext} lineError={lineError} />
      )}
    </main>
  );
}

function resolveLineError(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("line_")) return null;
  if (value === "line_state_mismatch") {
    return "セッション検証に失敗しました。もう一度お試しください";
  }
  if (value === "line_verify_failed") {
    return "LINE認証に失敗しました";
  }
  return "LINEログインで問題が発生しました";
}

function sanitizeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
