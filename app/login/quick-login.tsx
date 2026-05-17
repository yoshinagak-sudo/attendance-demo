"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DemoUser = {
  loginId: string;
  roleLabel: string;
  hint: string;
  variant: "manager" | "member" | "part";
};

const DEMO_USERS: DemoUser[] = [
  {
    loginId: "takayama",
    roleLabel: "管理者",
    hint: "全体俯瞰・承認・車両/日報の確認",
    variant: "manager",
  },
  {
    loginId: "sawano",
    roleLabel: "一般ユーザー",
    hint: "現場から打刻・申請・日報を入力",
    variant: "member",
  },
];

export function QuickLogin({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = async (loginId: string) => {
    if (pending) return;
    setError(null);
    setPending(loginId);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { user?: { role?: string } }
          | null;
        const role = data?.user?.role;
        const fallback = role === "manager" ? "/admin" : "/";
        const target = !next || next === "/" ? fallback : next;
        router.replace(target);
        router.refresh();
        return;
      }
      setError("ログインできませんでした");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="quick-login" aria-labelledby="quick-login-title">
      <div className="quick-login-head">
        <h2 id="quick-login-title" className="quick-login-title">
          かんたん体験ログイン
        </h2>
        <p className="quick-login-sub">
          パスワード不要。クリックした人になりきって試せます。
        </p>
      </div>
      <ul className="quick-login-list" role="list">
        {DEMO_USERS.map((u) => (
          <li key={u.loginId}>
            <button
              type="button"
              className={`quick-login-btn quick-login-btn-${u.variant}`}
              onClick={() => onClick(u.loginId)}
              disabled={!!pending}
              aria-busy={pending === u.loginId}
            >
              <span className="quick-login-role">{u.roleLabel}</span>
              <span className="quick-login-hint">{u.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="quick-login-error" role="alert">
          {error}
        </p>
      )}
      <p className="quick-login-note">
        デモ環境のため、誰でも全員分のデータを閲覧できます。本番運用時はこのセクションを無効化します。
      </p>
    </section>
  );
}
