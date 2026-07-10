"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  PunchIcon,
  OvertimeIcon,
  VehicleIcon,
  ReportIcon,
  AdminIcon,
} from "./icons";

type Role = "member" | "manager" | "developer";

/** lucide-react のアイコンコンポーネントが受け取れる props 型 */
type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** active 判定: 完全一致のみで判定するか（"/" 用） */
  exact?: boolean;
  /** manager のみに表示するタブ */
  managerOnly?: boolean;
};

const TABS: Tab[] = [
  { href: "/", label: "打刻", Icon: PunchIcon, exact: true },
  { href: "/overtime", label: "残業", Icon: OvertimeIcon },
  { href: "/vehicle", label: "車両", Icon: VehicleIcon },
  { href: "/report", label: "日報", Icon: ReportIcon },
  { href: "/admin", label: "管理", Icon: AdminIcon, managerOnly: true },
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

  const isAdmin = role === "manager" || role === "developer";
  const visible = TABS.filter((t) => (t.managerOnly ? isAdmin : true));

  return (
    <nav
      className="bottom-tab-bar"
      role="navigation"
      aria-label="主要機能ナビゲーション"
      style={{ ["--bottom-tab-count" as string]: visible.length }}
    >
      {visible.map((tab) => {
        const active = isActive(pathname, tab);
        const Icon = tab.Icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-tab-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="bottom-tab-icon" aria-hidden="true">
              <Icon
                width={22}
                height={22}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden="true"
                focusable="false"
              />
            </span>
            <span className="bottom-tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
