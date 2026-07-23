"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Calendar,
  Truck,
  Inbox,
  Users,
  Clock,
  FileText,
  Menu,
  X,
  ClipboardList,
  CalendarCheck,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "出勤状況", icon: Home },
  { href: "/dashboard/monthly", label: "月次集計", icon: Calendar },
  { href: "/dashboard/vehicle", label: "車両状況", icon: Truck },
  { href: "/dashboard/pending", label: "未対応", icon: Inbox },
  { href: "/dashboard/users", label: "社員管理", icon: Users },
  { href: "/dashboard/overtime", label: "残業・休日出勤承認", icon: Clock },
  { href: "/dashboard/attendance", label: "勤怠申請", icon: ClipboardList },
  { href: "/dashboard/paid-leave", label: "有給付与", icon: CalendarCheck },
  { href: "/dashboard/report", label: "日報", icon: FileText },
  { href: "/dashboard/settings/vehicle", label: "車両マスタ", icon: Truck },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === "/dashboard") {
    // トップは完全一致 (またはlogin以外の /dashboard 自体)
    return currentPath === "/dashboard" || currentPath === "/dashboard/";
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname() ?? "/dashboard";
  const [open, setOpen] = useState(false);

  // ルート変更で自動クローズ
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // drawer 表示中は背後スクロール抑制
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return;
  }, [open]);

  return (
    <>
      <div className="dash-mobile-bar">
        <button
          type="button"
          className="dash-mobile-bar-burger"
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
          aria-expanded={open}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <span className="dash-mobile-bar-title">管理ダッシュボード</span>
      </div>

      {open ? (
        <div
          className="dash-overlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <nav
        className={`dash-nav${open ? " is-open" : ""}`}
        aria-label="管理ダッシュボードメニュー"
      >
        <div className="dash-nav-head">
          <div className="dash-nav-head-inner">
            <img
              src="/ninau-logo.png"
              alt="株式会社ニナウ"
              className="dash-nav-logo"
              width={400}
              height={100}
            />
            <span className="dash-nav-sub">管理ダッシュボード</span>
          </div>
          <button
            type="button"
            className="dash-nav-close"
            onClick={() => setOpen(false)}
            aria-label="メニューを閉じる"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ul className="dash-nav-list">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`dash-nav-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="dash-nav-foot">
          <LogoutButton />
        </div>
      </nav>
    </>
  );
}
