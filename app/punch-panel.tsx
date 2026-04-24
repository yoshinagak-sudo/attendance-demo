"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type UserItem = {
  id: string;
  name: string;
  latest: { type: string; timestamp: string } | null;
};

type RecentItem = {
  id: string;
  userName: string;
  type: string;
  timestamp: string;
};

type Toast =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatClock(d: Date): { hm: string; ss: string; date: string } {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const w = WEEKDAYS[d.getDay()];
  return {
    hm: `${hh}:${mm}`,
    ss,
    date: `${y}/${mo}/${da} (${w})`,
  };
}

function formatHM(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatAgo(iso: string, now: Date): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  return `${hr}時間${min % 60}分前`;
}

export function PunchPanel({
  users,
  recent,
  serverNow,
}: {
  users: UserItem[];
  recent: RecentItem[];
  serverNow: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  const [toast, setToast] = useState<Toast | null>(null);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 毎秒時計を更新
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // トースト自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const clock = useMemo(() => formatClock(now), [now]);

  const punch = async (user: UserItem) => {
    if (pendingId || isPending) return;
    // 最新が IN なら OUT、それ以外（未打刻 or OUT）なら IN
    const nextType: "IN" | "OUT" = user.latest?.type === "IN" ? "OUT" : "IN";
    setPendingId(user.id);
    setFlashingId(user.id);
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, type: nextType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setToast({
          kind: "error",
          message: `エラー: ${err.error ?? res.status}`,
        });
        setFlashingId(null);
        return;
      }
      setToast({
        kind: "success",
        message: `${user.name}さん ${nextType === "IN" ? "出勤" : "退勤"}しました`,
      });
      // フラッシュが終わるのを待ってから画面を再取得
      setTimeout(() => setFlashingId(null), 600);
      startTransition(() => router.refresh());
    } catch (e) {
      setToast({ kind: "error", message: "通信エラーが発生しました" });
      setFlashingId(null);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      {/* 大時計 */}
      <section className="clock-wrap" aria-label="現在時刻">
        <div className="clock-date">{clock.date}</div>
        <div className="clock-time" aria-live="off">
          {clock.hm}
          <span className="clock-time-seconds">:{clock.ss}</span>
        </div>
      </section>

      {/* 名前ボタングリッド */}
      <div className="punch-section-head">
        <h2 className="punch-section-title">打刻 · タップで切替</h2>
        <span className="punch-section-hint">未打刻→出勤 / 出勤中→退勤</span>
      </div>
      <section className="punch-grid" aria-label="従業員一覧">
        {users.map((u) => {
          const isWorking = u.latest?.type === "IN";
          const isDone = u.latest?.type === "OUT";
          const cls = isWorking
            ? "punch-btn punch-btn-working"
            : isDone
              ? "punch-btn punch-btn-done"
              : "punch-btn";
          const statusText = isWorking
            ? `${formatHM(u.latest!.timestamp)} 出勤中`
            : isDone
              ? `${formatHM(u.latest!.timestamp)} 退勤済`
              : "未打刻";
          const nextAction = isWorking ? "退勤" : "出勤";
          return (
            <button
              key={u.id}
              type="button"
              className={cls}
              onClick={() => punch(u)}
              disabled={pendingId !== null || isPending}
              aria-label={`${u.name} ${nextAction}打刻`}
            >
              <span className="punch-btn-name">{u.name}</span>
              <span className="punch-btn-status">{statusText}</span>
              {flashingId === u.id && (
                <span className="punch-btn-flash" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {users.length === 0 && (
          <div className="recent-empty">従業員が登録されていません</div>
        )}
      </section>

      {/* 直近履歴 */}
      <section className="recent" aria-label="直近の打刻">
        <div className="recent-head">
          <h2 className="recent-title">直近の打刻</h2>
          <span className="recent-sub">最新3件</span>
        </div>
        <div className="recent-grid">
          {recent.length === 0 ? (
            <div className="recent-empty">本日の打刻はまだありません</div>
          ) : (
            recent.map((r) => (
              <div key={r.id} className="recent-card">
                <div className="recent-card-head">
                  <span className="recent-ago">{formatAgo(r.timestamp, now)}</span>
                  <span
                    className={
                      r.type === "IN" ? "badge badge-in" : "badge badge-out"
                    }
                  >
                    {r.type === "IN" ? "出勤" : "退勤"}
                  </span>
                </div>
                <div className="recent-name" title={r.userName}>
                  {r.userName}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {toast && (
        <div
          className={
            toast.kind === "error"
              ? "punch-toast punch-toast-error"
              : "punch-toast"
          }
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
