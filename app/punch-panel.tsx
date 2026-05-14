"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type RecordItem = {
  id: string;
  type: "IN" | "OUT";
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

type Props = {
  userName: string;
  latestType: "IN" | "OUT" | null;
  latestAt: string | null;
  todayRecords: RecordItem[];
  serverNow: string;
  isManager: boolean;
};

type ShortcutDef = {
  href: string;
  icon: string;
  title: string;
  sub: string;
  managerOnly?: boolean;
};

const SHORTCUTS: ShortcutDef[] = [
  { href: "/overtime", icon: "⏱", title: "残業申請", sub: "事前/事後の申請・履歴" },
  { href: "/vehicle", icon: "🚐", title: "車両管理", sub: "車両の使用記録・点検" },
  { href: "/report", icon: "📝", title: "日報", sub: "本日の業務報告を作成" },
  { href: "/admin", icon: "📊", title: "管理画面", sub: "勤怠・申請の管理", managerOnly: true },
];

export function PunchPanel({
  userName,
  latestType,
  latestAt,
  todayRecords,
  serverNow: _serverNow,
  isManager,
}: Props) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [punchPending, setPunchPending] = useState(false);
  const [, startTransition] = useTransition();

  // クライアントマウント後に時計を起動（hydration mismatch 回避）
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // トースト自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const clock = useMemo(
    () => (now ? formatClock(now) : { hm: "--:--", ss: "--", date: "" }),
    [now],
  );

  const isWorking = latestType === "IN";
  const isDone = latestType === "OUT";

  // 次のアクション: 出勤中なら退勤、それ以外（未打刻 / 退勤済）なら出勤
  const nextType: "IN" | "OUT" = isWorking ? "OUT" : "IN";
  const ctaClass = isWorking ? "punch-cta punch-cta-out" : "punch-cta punch-cta-in";
  const ctaLabel = isWorking ? "退勤" : "出勤";
  const ctaSub = isWorking
    ? "タップで退勤を記録します"
    : isDone
      ? "再度出勤する場合はこちら"
      : "タップで出勤を記録します";

  const statusDotClass = isWorking
    ? "punch-status-dot punch-status-dot-in"
    : isDone
      ? "punch-status-dot punch-status-dot-out"
      : "punch-status-dot punch-status-dot-none";
  const statusLabel = isWorking
    ? "出勤中"
    : isDone
      ? "退勤済"
      : "未打刻";
  const statusTime =
    latestAt && (isWorking || isDone)
      ? `${formatHM(latestAt)} から`
      : "本日まだ打刻していません";

  const handlePunch = async () => {
    if (punchPending) return;
    setPunchPending(true);
    setFlashing(true);
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: nextType }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          // セッション切れ → ログインへ
          router.replace("/login?next=%2F");
          return;
        }
        const err = await res.json().catch(() => ({}));
        setToast({
          kind: "error",
          message: `エラー: ${err.error ?? res.status}`,
        });
        setFlashing(false);
        return;
      }
      setToast({
        kind: "success",
        message: `${userName}さん ${nextType === "IN" ? "出勤" : "退勤"}しました`,
      });
      setTimeout(() => setFlashing(false), 600);
      startTransition(() => router.refresh());
    } catch {
      setToast({ kind: "error", message: "通信エラーが発生しました" });
      setFlashing(false);
    } finally {
      setPunchPending(false);
    }
  };

  return (
    <>
      {/* 大時計 */}
      <section className="clock-wrap" aria-label="現在時刻">
        <div className="clock-date" suppressHydrationWarning>{clock.date}</div>
        <div className="clock-time" aria-live="off" suppressHydrationWarning>
          {clock.hm}
          <span className="clock-time-seconds">:{clock.ss}</span>
        </div>
      </section>

      {/* 現在のステータス */}
      <section className="punch-status-card" aria-label="現在のステータス">
        <div>
          <div className="punch-status-label">現在のステータス</div>
          <div className="punch-status-value">
            <span className={statusDotClass} aria-hidden="true" />
            <span>{statusLabel}</span>
          </div>
        </div>
        <div className="punch-status-time" aria-live="polite">
          {statusTime}
        </div>
      </section>

      {/* 巨大CTA */}
      <div className="punch-cta-wrap">
        <button
          type="button"
          className={ctaClass}
          onClick={handlePunch}
          disabled={punchPending}
          aria-label={`${userName} ${ctaLabel}打刻`}
        >
          <span className="punch-cta-label">{ctaLabel}</span>
          <span className="punch-cta-sub">{ctaSub}</span>
          {flashing && (
            <span className="punch-cta-flash" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      </div>

      {/* 関連動線: メニューショートカット */}
      <nav className="home-shortcuts-grid" aria-label="メニュー">
        {SHORTCUTS.filter((s) => !s.managerOnly || isManager).map((s) => (
          <Link key={s.href} href={s.href} className="home-shortcut-card">
            <span className="home-shortcut-icon" aria-hidden="true">
              {s.icon}
            </span>
            <span className="home-shortcut-body">
              <span className="home-shortcut-title">{s.title}</span>
              <span className="home-shortcut-sub">{s.sub}</span>
            </span>
            <span className="home-shortcut-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>

      {/* 本日の自分の打刻履歴（全件） */}
      <section className="recent" aria-label="本日の自分の打刻履歴">
        <div className="recent-head">
          <h2 className="recent-title">本日の打刻履歴</h2>
          <span className="recent-sub tabular">全 {todayRecords.length} 件</span>
        </div>
        {todayRecords.length === 0 ? (
          <div className="recent-empty">本日の打刻はまだありません</div>
        ) : (
          <div className="punch-history-list">
            {todayRecords.map((r) => (
              <div key={r.id} className="recent-card">
                <div className="recent-card-head">
                  <span className="recent-ago" suppressHydrationWarning>
                    {now ? formatAgo(r.timestamp, now) : ""}
                  </span>
                  <span
                    className={
                      r.type === "IN" ? "badge badge-in" : "badge badge-out"
                    }
                  >
                    {r.type === "IN" ? "出勤" : "退勤"}
                  </span>
                </div>
                <div className="recent-name tabular">
                  {formatHM(r.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
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
