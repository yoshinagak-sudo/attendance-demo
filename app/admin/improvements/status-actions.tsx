"use client";

/**
 * 改善依頼: ステータス変更（管理画面 行内ボタン群）
 *
 * - 親 server component から improvementId と currentStatus を受け取る
 * - useActionState(changeImprovementStatusAction) で 4 状態のボタンを描画
 * - pending 中は全ボタンを disabled、エラー時は下にインライン表示
 * - 現在のステータスは is-current で primary tint。クリックで自分自身に再投入しない (disabled)
 */

import { useActionState } from "react";
import {
  changeImprovementStatusAction,
  type StatusState,
} from "@/app/improvements/actions";

type StatusKey = "open" | "in_progress" | "done" | "wontfix";

const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "open", label: "未対応" },
  { value: "in_progress", label: "対応中" },
  { value: "done", label: "完了" },
  { value: "wontfix", label: "見送り" },
];

export function StatusActions({
  improvementId,
  currentStatus,
}: {
  improvementId: string;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState<StatusState, FormData>(
    changeImprovementStatusAction,
    null,
  );

  // 親 server component が revalidate→再描画するため、currentStatus は常に最新が来る前提。
  // ローカル state では持たない（楽観UI不要・確実な server 反映優先）
  const effectiveStatus =
    state && state.ok && state.id === improvementId ? state.status : currentStatus;

  const formError = state && !state.ok ? state.error : null;

  return (
    <div>
      <form action={formAction} className="imp-status-actions" noValidate>
        <input type="hidden" name="id" value={improvementId} />
        {STATUS_OPTIONS.map((opt) => {
          const isCurrent = opt.value === effectiveStatus;
          return (
            <button
              key={opt.value}
              type="submit"
              name="status"
              value={opt.value}
              className={
                isCurrent
                  ? "imp-status-btn is-current"
                  : "imp-status-btn"
              }
              disabled={pending || isCurrent}
              aria-pressed={isCurrent}
              aria-label={`ステータスを「${opt.label}」に変更`}
              title={isCurrent ? "現在のステータス" : `「${opt.label}」に変更`}
            >
              {opt.label}
            </button>
          );
        })}
      </form>
      {formError && (
        <p className="imp-status-actions-error" role="alert">
          {formError}
        </p>
      )}
    </div>
  );
}
