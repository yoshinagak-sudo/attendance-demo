"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

export function AppHeaderBrand() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 失敗してもログイン画面に飛ばす
    }
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  };

  return (
    <a
      href="/login"
      onClick={handleClick}
      className="header-app-brand"
      aria-label="ログイン選択画面に戻る（ログアウト）"
    >
      <img
        src="/ninau-logo.png"
        alt="株式会社ニナウ"
        className="header-app-logo"
        width={546}
        height={136}
      />
      <span className="header-app-brand-name">勤怠アプリ</span>
    </a>
  );
}
