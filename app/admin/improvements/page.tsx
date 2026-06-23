/**
 * 改善依頼 管理画面 /admin/improvements (manager / developer)
 *
 * - 全件（最新200件）一覧 + ステータス別カウント
 * - ステータス変更は行内のクライアントコンポーネント (StatusActions) で
 * - レスポンシブ: 720px 以上はテーブル、未満は同データのカードリスト
 */

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/session";
import { formatJSTYmdHm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { ImprovementIcon } from "@/app/_components/icons";
import { StatusActions } from "./status-actions";

export const dynamic = "force-dynamic";

type StatusKey = "open" | "in_progress" | "done" | "wontfix";

const STATUS_ORDER: StatusKey[] = ["open", "in_progress", "done", "wontfix"];

const STATUS_LABEL: Record<StatusKey, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "対応完了",
  wontfix: "見送り",
};

function statusBadgeClass(status: string): string {
  switch (status as StatusKey) {
    case "open":
      return "badge imp-status-open";
    case "in_progress":
      return "badge imp-status-in_progress";
    case "done":
      return "badge imp-status-done";
    case "wontfix":
      return "badge imp-status-wontfix";
    default:
      return "badge";
  }
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status as StatusKey] ?? status;
}

export default async function AdminImprovementsPage() {
  noStore();
  const session = await requireManager("/admin/improvements");

  // groupBy と findMany を並列実行
  const [all, counts] = await Promise.all([
    prisma.improvement.findMany({
      // open を最上段、その中で新しい順 ＝ Prisma の orderBy 配列で1次キーに status、2次キーに createdAt
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        author: { select: { name: true } },
        handledBy: { select: { name: true } },
      },
    }),
    prisma.improvement.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  // status -> count の Map を作り、定義された4状態を全て表示（0件でも見せる）
  const countMap = new Map<string, number>();
  for (const row of counts) {
    countMap.set(row.status, row._count._all);
  }
  const totalCount = all.length;
  const openCount = countMap.get("open") ?? 0;

  return (
    <>
      <AppHeader user={session} />
      <main className="container-wide">
        <header className="header">
          <div>
            <h1 className="title">
              <ImprovementIcon
                width={20}
                height={20}
                aria-hidden="true"
                style={{ verticalAlign: "-3px", marginRight: 6 }}
              />
              改善依頼の管理
            </h1>
            <span className="subtitle">
              現場からの改善依頼を受け付け、ステータスを更新します
              {openCount > 0 && (
                <>
                  {" "}
                  ・ 未対応 <strong style={{ color: "var(--warn)" }}>
                    {openCount}
                  </strong>{" "}
                  件
                </>
              )}
            </span>
          </div>
          <div className="ot-admin-actions">
            <Link href="/improvements" className="link">
              投稿画面
            </Link>
            <Link href="/admin" className="link">
              ← 管理画面
            </Link>
          </div>
        </header>

        {/* 1. ステータス別カウント -------------------------------------- */}
        <section className="section" aria-labelledby="imp-counts-heading">
          <div className="section-head">
            <h2 id="imp-counts-heading" className="section-title">
              ステータス別件数
            </h2>
            <span className="section-sub tabular">
              合計{" "}
              {[...countMap.values()].reduce((s, n) => s + n, 0)} 件
            </span>
          </div>
          <div className="imp-counts" role="list">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="imp-count-card" role="listitem">
                <div className="imp-count-card-head">
                  <span className={statusBadgeClass(s)}>
                    {statusLabel(s)}
                  </span>
                </div>
                <div className="imp-count-card-value">
                  <span>{countMap.get(s) ?? 0}</span>
                  <span className="imp-count-card-unit">件</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 2. 全件一覧 ------------------------------------------------ */}
        <section className="section" aria-labelledby="imp-all-heading">
          <div className="section-head">
            <h2 id="imp-all-heading" className="section-title">
              改善依頼一覧
            </h2>
            <span className="section-sub tabular">
              直近 {totalCount} 件
              {totalCount >= 200 && <>（最大 200 件まで表示）</>}
            </span>
          </div>

          {totalCount === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">
                まだ改善依頼は届いていません
              </div>
              <div>
                投稿画面のリンクを社内に共有してください
              </div>
            </div>
          ) : (
            <>
              {/* デスクトップ: テーブル */}
              <div className="imp-desktop-only">
                <div className="table-wrap is-scrollable">
                  <table className="imp-table">
                    <thead>
                      <tr>
                        <th style={{ width: 150 }}>投稿日時</th>
                        <th style={{ width: 120 }}>投稿者</th>
                        <th>本文</th>
                        <th style={{ width: 110 }}>ステータス</th>
                        <th style={{ width: 110 }}>最終対応者</th>
                        <th style={{ width: 1 }}>変更</th>
                      </tr>
                    </thead>
                    <tbody>
                      {all.map((r) => (
                        <tr key={r.id}>
                          <td className="imp-cell-date">
                            {formatJSTYmdHm(r.createdAt)}
                          </td>
                          <td className="imp-cell-user">{r.author.name}</td>
                          <td>
                            <div className="imp-cell-body">{r.body}</div>
                          </td>
                          <td className="imp-cell-status">
                            <span className={statusBadgeClass(r.status)}>
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td
                            className={
                              r.handledBy?.name
                                ? "imp-cell-handler"
                                : "imp-cell-handler imp-cell-handler-empty"
                            }
                          >
                            {r.handledBy?.name ?? "—"}
                          </td>
                          <td className="imp-cell-actions">
                            <StatusActions
                              improvementId={r.id}
                              currentStatus={r.status}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* モバイル: カード */}
              <div className="imp-mobile-only">
                <div className="imp-card-list">
                  {all.map((r) => (
                    <article key={r.id} className="imp-card">
                      <div className="imp-card-head">
                        <div className="imp-card-meta">
                          <span className="imp-card-user">{r.author.name}</span>
                          <span className="imp-card-date">
                            {formatJSTYmdHm(r.createdAt)}
                          </span>
                        </div>
                        <span className={statusBadgeClass(r.status)}>
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <div className="imp-card-body">{r.body}</div>
                      <div className="imp-card-foot">
                        <span className="imp-card-handler">
                          最終対応者:{" "}
                          <strong>{r.handledBy?.name ?? "—"}</strong>
                        </span>
                        <StatusActions
                          improvementId={r.id}
                          currentStatus={r.status}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
