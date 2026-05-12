import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { UserMenu } from "./UserMenu";
import { IdleLogout } from "./IdleLogout";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <>
      <IdleLogout />
      <header className="header-app">
        <div className="header-app-inner">
          <Link href="/" className="header-app-brand" aria-label="勤怠アプリ トップへ">
            <img
              src="/ninau-logo.png"
              alt="株式会社ニナウ"
              className="header-app-logo"
              width={546}
              height={136}
            />
            <span className="header-app-brand-name">勤怠アプリ</span>
          </Link>
          <UserMenu user={user} />
        </div>
      </header>
    </>
  );
}
