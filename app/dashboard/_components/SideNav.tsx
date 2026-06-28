"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Calendar,
  Truck,
  Inbox,
  Menu,
  X,
  LayoutDashboard,
  Users,
  ClipboardList,
  CheckSquare,
  FileText,
  Settings,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "概況",
    items: [
      { href: "/dashboard", label: "出勤状況", icon: Home },
      { href: "/dashboard/monthly", label: "月次集計", icon: Calendar },
      { href: "/dashboard/vehicle", label: "車両状況", icon: Truck },
      { href: "/dashboard/pending", label: "未対応", icon: Inbox },
    ],
  },
  {
    label: "詳細管理",
    items: [
      { href: "/admin", label: "ダッシュボード（ガント）", icon: LayoutDashboard },
      { href: "/admin/users", label: "ユーザー管理", icon: Users },
      { href: "/admin/overtime", label: "残業申請の承認", icon: CheckSquare },
      { href: "/admin/overtime/report", label: "残業月次レポート", icon: Calendar },
      { href: "/admin/report", label: "日報一覧", icon: ClipboardList },
      { href: "/admin/report/month", label: "日報 月次サマリ", icon: Calendar },
      { href: "/admin/vehicle", label: "車両 詳細", icon: Truck },
      { href: "/admin/vehicle/report", label: "車両 月次レポート", icon: FileText },
    ],
  },
  {
    label: "設定",
    items: [
      { href: "/admin/settings/overtime", label: "残業設定", icon: Settings },
      { href: "/admin/settings/vehicle", label: "車両マスタ", icon: Settings },
    ],
  },
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

        <div className="dash-nav-scroll">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="dash-nav-group">
              <div className="dash-nav-group-label">{group.label}</div>
              <ul className="dash-nav-list">
                {group.items.map((item) => {
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
            </div>
          ))}
        </div>

        <div className="dash-nav-foot">
          <LogoutButton />
        </div>
      </nav>
    </>
  );
}
