"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SessionUser } from "@/lib/session";

const DEMO_SWITCH = [
  { loginId: "takayama", label: "代表取締役（manager）" },
  { loginId: "hisa", label: "課長（manager）" },
  { loginId: "sawano", label: "現場社員（member）" },
  { loginId: "numakura", label: "蛸と衣 社員（member）" },
];

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [isPending, startTransition] = useTransition();
  const [loggingOut, setLoggingOut] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const isManager = user.role === "manager";
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        ref.current.open = false;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 失敗してもログイン画面に飛ばす
    }
    close();
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  };

  const handleSwitch = async (loginId: string) => {
    if (switching) return;
    setSwitching(loginId);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId }),
      });
      if (!res.ok) {
        setSwitching(null);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { user?: { role?: string } }
        | null;
      const role = data?.user?.role;
      const target = role === "manager" ? "/admin" : "/";
      close();
      startTransition(() => {
        router.replace(target);
        router.refresh();
      });
    } catch {
      setSwitching(null);
    }
  };

  return (
    <details className="user-menu" ref={ref}>
      <summary aria-label="ユーザーメニューを開く">
        <span className="user-menu-name">{user.name}</span>
        {isManager && (
          <span className="user-menu-role" aria-label="管理者">
            manager
          </span>
        )}
        <span className="user-menu-caret" aria-hidden="true">▾</span>
      </summary>
      <div className="user-menu-dropdown" role="menu">
        <Link href="/" className="user-menu-item" role="menuitem" onClick={close}>
          打刻画面
        </Link>
        <Link
          href="/overtime"
          className="user-menu-item"
          role="menuitem"
          onClick={close}
        >
          残業申請
        </Link>
        <Link
          href="/vehicle"
          className="user-menu-item"
          role="menuitem"
          onClick={close}
        >
          車両管理
        </Link>
        <Link
          href="/report"
          className="user-menu-item"
          role="menuitem"
          onClick={close}
        >
          日報
        </Link>
        {isManager && (
          <>
            <div className="user-menu-divider" role="separator" aria-hidden="true" />
            <Link
              href="/admin"
              className="user-menu-item"
              role="menuitem"
              onClick={close}
            >
              管理画面
            </Link>
            <Link
              href="/admin/users"
              className="user-menu-item"
              role="menuitem"
              onClick={close}
            >
              ユーザー管理
            </Link>
          </>
        )}
        {demoMode && (
          <>
            <div className="user-menu-divider" role="separator" aria-hidden="true" />
            <div className="user-menu-section-label">デモ: 別の人で試す</div>
            {DEMO_SWITCH.filter((d) => d.loginId !== user.loginId).map((d) => (
              <button
                key={d.loginId}
                type="button"
                className="user-menu-item user-menu-item-demo"
                role="menuitem"
                onClick={() => handleSwitch(d.loginId)}
                disabled={!!switching}
              >
                {switching === d.loginId ? "切替中…" : d.label}
              </button>
            ))}
          </>
        )}
        <div className="user-menu-divider" role="separator" aria-hidden="true" />
        <button
          type="button"
          className="user-menu-item user-menu-item-danger"
          role="menuitem"
          onClick={handleLogout}
          disabled={loggingOut || isPending}
        >
          {loggingOut ? "ログアウト中…" : "ログアウト"}
        </button>
      </div>
    </details>
  );
}
