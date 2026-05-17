import type { SessionUser } from "@/lib/session";
import { UserMenu } from "./UserMenu";
import { IdleLogout } from "./IdleLogout";
import { AppHeaderBrand } from "./AppHeaderBrand";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <>
      <IdleLogout />
      <header className="header-app">
        <div className="header-app-inner">
          <AppHeaderBrand />
          <UserMenu user={user} />
        </div>
      </header>
    </>
  );
}
