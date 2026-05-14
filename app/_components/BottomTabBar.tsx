"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "member" | "manager";

type Tab = {
  href: string;
  label: string;
  icon: string;
  /** active 判定: 完全一致のみで判定するか（"/" 用） */
  exact?: boolean;
  /** manager のみに表示するタブ */
  managerOnly?: boolean;
};

const TABS: Tab[] = [
  { href: "/", label: "ホーム", icon: "🏠", exact: true },
  { href: "/overtime", label: "残業", icon: "⏱" },
  { href: "/vehicle", label: "車両", icon: "🚐" },
  { href: "/report", label: "日報", icon: "📝" },
  { href: "/admin", label: "管理", icon: "📊", managerOnly: true },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

export function BottomTabBar({ role }: { role: Role }) {
  const pathname = usePathname() ?? "/";

  // 安全網: ログイン画面では描画しない（layout 側でも判定済みだが client 側でも保険）
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return null;
  }

  const visible = TABS.filter((t) => (t.managerOnly ? role === "manager" : true));

  return (
    <nav
      className="bottom-tab-bar"
      role="navigation"
      aria-label="主要機能ナビゲーション"
      style={{ ["--bottom-tab-count" as string]: visible.length }}
    >
      {visible.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-tab-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="bottom-tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="bottom-tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
