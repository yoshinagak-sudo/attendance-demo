"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { SessionUser } from "@/lib/session";

/**
 * 右上のユーザーメニュー。
 * details/summary を使い、JS なしでも一応開閉できる。
 * クリックで遷移/ログアウトを実行するため "use client"。
 */
export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [isPending, startTransition] = useTransition();
  const [loggingOut, setLoggingOut] = useState(false);
  const isManager = user.role === "manager";

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  // 外側クリックで閉じる
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
