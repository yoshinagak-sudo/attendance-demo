"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DemoUser = {
  loginId: string;
  name: string;
  roleLabel: string;
  hint: string;
  variant: "manager" | "member" | "part";
};

const DEMO_USERS: DemoUser[] = [
  {
    loginId: "takayama",
    name: "髙山 澄人",
    roleLabel: "代表取締役",
    hint: "経営層として全体を俯瞰",
    variant: "manager",
  },
  {
    loginId: "hisa",
    name: "比佐 京太",
    roleLabel: "課長",
    hint: "残業承認の動きを体験",
    variant: "manager",
  },
  {
    loginId: "sawano",
    name: "澤野 大和",
    roleLabel: "現場社員",
    hint: "現場から残業申請する側",
    variant: "member",
  },
  {
    loginId: "numakura",
    name: "沼倉 友香",
    roleLabel: "蛸と衣 社員",
    hint: "店舗運営側のメンバー",
    variant: "part",
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
        router.replace(next || "/");
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
              <span className="quick-login-name">{u.name}</span>
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
