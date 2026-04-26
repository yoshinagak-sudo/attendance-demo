import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  formatDurationJa,
  type OvertimeStatus,
  type RequestType,
} from "@/lib/overtime";
import { formatJSTYmd, formatJSTHHmm } from "@/lib/time";

export const dynamic = "force-dynamic";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatHistoryDate(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEKDAY_JA[dow]}）`;
}

function statusBadgeClass(status: string): string {
  switch (status as OvertimeStatus) {
    case "submitted":
      return "badge ot-badge-submitted";
    case "approved":
      return "badge ot-badge-approved";
    case "rejected":
      return "badge ot-badge-rejected";
    case "sent_back":
      return "badge ot-badge-sent-back";
    default:
      return "badge";
  }
}

type SearchParams = Promise<{
  actor?: string;
  withdrawn?: string;
}>;

export default async function OvertimeIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const actorId = params.actor?.trim() || "";
  const withdrawn = params.withdrawn === "1";

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
  });

  const currentActor = actorId ? users.find((u) => u.id === actorId) : null;

  const requests = currentActor
    ? await prisma.overtimeRequest.findMany({
        where: { userId: currentActor.id },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 30,
      })
    : [];

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">残業申請</h1>
          <span className="subtitle">事前申請推奨。事後申請も当日中は可能</span>
        </div>
        <Link href="/" className="link">
          ← 打刻画面
        </Link>
      </header>

      {withdrawn && (
        <div className="ot-toast" role="status" aria-live="polite">
          申請を取り消しました
        </div>
      )}

      <section className="section" aria-labelledby="ot-actor-heading">
        <div className="section-head">
          <h2 id="ot-actor-heading" className="section-title">
            申請者を選択
          </h2>
          {currentActor && (
            <span className="section-sub">
              現在: <strong style={{ color: "var(--text)" }}>{currentActor.name}</strong>
            </span>
          )}
        </div>
        {users.length === 0 ? (
          <div className="ot-empty">従業員が登録されていません</div>
        ) : (
          <div className="ot-actor-grid" role="group" aria-label="申請者一覧">
            {users.map((u) => {
              const isActive = currentActor?.id === u.id;
              return (
                <Link
                  key={u.id}
                  href={`/overtime?actor=${encodeURIComponent(u.id)}`}
                  className={
                    isActive ? "ot-actor-btn is-active" : "ot-actor-btn"
                  }
                  aria-current={isActive ? "true" : undefined}
                >
                  {u.name}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {currentActor && (
        <>
          <div className="ot-cta-row">
            <Link
              href={`/overtime/new?actor=${encodeURIComponent(currentActor.id)}`}
              className="ot-btn-primary ot-btn-lg ot-btn-block"
            >
              + 新規申請を作成
            </Link>
          </div>

          <section className="section" aria-labelledby="ot-history-heading">
            <div className="section-head">
              <h2 id="ot-history-heading" className="section-title">
                自分の申請履歴
              </h2>
              <span className="section-sub tabular">全 {requests.length} 件</span>
            </div>

            {requests.length === 0 ? (
              <div className="ot-empty">
                <div className="ot-empty-title">まだ申請がありません</div>
                <div>「+ 新規申請を作成」から始めてください</div>
              </div>
            ) : (
              <div className="ot-history-list">
                {requests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/overtime/${r.id}?actor=${encodeURIComponent(currentActor.id)}`}
                    className="ot-history-row"
                  >
                    <div className="ot-history-main">
                      <div className="ot-history-date">
                        {formatHistoryDate(r.workDate)}
                        <span style={{ marginLeft: 8, color: "var(--muted-2)" }}>
                          {REQUEST_TYPE_LABEL[r.requestType as RequestType] ?? "—"}申請
                        </span>
                      </div>
                      <div className="ot-history-detail" title={r.workSiteName}>
                        {r.workSiteName}
                      </div>
                      <div className="ot-history-time">
                        {formatJSTHHmm(r.startAt)} 〜 {formatJSTHHmm(r.endAt)}（
                        {formatDurationJa(r.durationMinutes)}）
                      </div>
                    </div>
                    <div className="ot-history-side">
                      <span className={statusBadgeClass(r.status)}>
                        {STATUS_LABEL[r.status as OvertimeStatus] ?? r.status}
                      </span>
                      <span className="ot-history-arrow" aria-hidden="true">
                        ›
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {!currentActor && users.length > 0 && (
        <div className="ot-empty">
          <div className="ot-empty-title">申請者を選んでください</div>
          <div>上のボタンから自分の名前を選ぶと、新規申請と履歴が表示されます</div>
        </div>
      )}
    </main>
  );
}
