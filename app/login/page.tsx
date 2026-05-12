import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import { QuickLogin } from "./quick-login";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  if (session) {
    redirect(next);
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
      {demoMode && <QuickLogin next={next} />}
      <LoginForm next={next} />
    </main>
  );
}

function sanitizeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
