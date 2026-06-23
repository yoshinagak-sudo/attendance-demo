/**
 * 改善依頼（一般ユーザー） /improvements
 *
 * - 誰でも見られる（ログイン必須）。自分の投稿一覧と、新規投稿フォームを 1 画面に同居
 * - データ層: prisma.improvement.findMany (authorId = session.id, 直近 50 件)
 * - Server Action は ./actions.ts の submitImprovementAction を client 側 (SubmitForm) で利用
 */

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { formatJSTYmdHm } from "@/lib/time";
import { AppHeader } from "@/app/_components/AppHeader";
import { ImprovementIcon } from "@/app/_components/icons";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

type StatusKey = "open" | "in_progress" | "done" | "wontfix";

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

function normalizeStatusLabel(status: string): string {
  return STATUS_LABEL[status as StatusKey] ?? status;
}

export default async function ImprovementsPage() {
  noStore();
  const session = await requireSession("/improvements");

  const mine = await prisma.improvement.findMany({
    where: { authorId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { handledBy: { select: { name: true } } },
  });

  const isAdmin = session.role === "manager" || session.role === "developer";

  return (
    <>
      <AppHeader user={session} />
      <main className="container">
        <header className="header">
          <div>
            <h1 className="title">
              <ImprovementIcon
                width={20}
                height={20}
                aria-hidden="true"
                style={{ verticalAlign: "-3px", marginRight: 6 }}
              />
              改善依頼
            </h1>
            <span className="subtitle">
              使いにくい点・直してほしい点を、いつでもどうぞ。
              {isAdmin && (
                <>
                  {" "}
                  <Link href="/admin/improvements" className="link">
                    管理画面 →
                  </Link>
                </>
              )}
            </span>
          </div>
          <Link href="/" className="link">
            ← 打刻画面
          </Link>
        </header>

        {/* 1. 入力フォーム ----------------------------------------------- */}
        <section className="section" aria-labelledby="imp-submit-heading">
          <div className="section-head">
            <h2 id="imp-submit-heading" className="section-title">
              新しい改善依頼を送る
            </h2>
            <span className="section-sub">最大 1000 文字</span>
          </div>
          <div className="ot-form-card">
            <SubmitForm />
          </div>
        </section>

        {/* 2. 自分の改善依頼履歴 ----------------------------------------- */}
        <section className="section" aria-labelledby="imp-mine-heading">
          <div className="section-head">
            <h2 id="imp-mine-heading" className="section-title">
              あなたの改善依頼履歴
            </h2>
            <span className="section-sub tabular">全 {mine.length} 件</span>
          </div>

          {mine.length === 0 ? (
            <div className="ot-empty">
              <div className="ot-empty-title">
                まだ送信した依頼はありません
              </div>
              <div>
                上のフォームから、思いついたことを気軽に送ってください
              </div>
            </div>
          ) : (
            <div className="table-wrap is-scrollable">
              <table className="imp-table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>投稿日時</th>
                    <th>本文</th>
                    <th style={{ width: 110 }}>ステータス</th>
                    <th style={{ width: 130 }}>対応者</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => (
                    <tr key={r.id}>
                      <td className="imp-cell-date">
                        {formatJSTYmdHm(r.createdAt)}
                      </td>
                      <td>
                        <div className="imp-cell-body imp-cell-body-clamp">
                          {r.body}
                        </div>
                      </td>
                      <td className="imp-cell-status">
                        <span className={statusBadgeClass(r.status)}>
                          {normalizeStatusLabel(r.status)}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
