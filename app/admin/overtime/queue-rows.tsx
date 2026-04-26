"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  approveRequestAction,
  rejectRequestAction,
  sendBackRequestAction,
} from "@/app/overtime/actions";
import {
  REQUEST_TYPE_LABEL,
  REVIEW_COMMENT_MAX_CHARS,
  STATUS_LABEL,
  codePointLength,
  type OvertimeStatus,
  type RequestType,
} from "@/lib/overtime";
import { REVIEWER_STORAGE_KEY } from "./reviewer-select";

function statusBadgeClass(status: OvertimeStatus): string {
  switch (status) {
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

type Row = {
  id: string;
  workDateLabel: string;
  userName: string;
  requestType: RequestType;
  timeRange: string;
  durationLabel: string;
  workSiteName: string;
  description: string;
  status: OvertimeStatus;
};

type Props = {
  rows: Row[];
};

type ExpandMode = null | "reject" | "send_back";

/**
 * 承認キューのテーブル行群（client）。
 * - 「承認」は即時 form submit
 * - 「差戻」「却下」は同行直下に展開してコメント入力
 * - 承認者ID は localStorage / CustomEvent から取得
 */
export function QueueRows({ rows }: Props) {
  const [reviewerId, setReviewerId] = useState<string>("");
  const [expand, setExpand] = useState<{ id: string; mode: ExpandMode } | null>(
    null,
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REVIEWER_STORAGE_KEY);
      if (saved) setReviewerId(saved);
    } catch {
      // ignore
    }
    function onChange(e: Event) {
      const ce = e as CustomEvent<{ id: string }>;
      if (ce.detail?.id) setReviewerId(ce.detail.id);
    }
    window.addEventListener("ot:reviewer-change", onChange);
    return () => window.removeEventListener("ot:reviewer-change", onChange);
  }, []);

  function toggle(id: string, mode: Exclude<ExpandMode, null>) {
    setExpand((prev) =>
      prev && prev.id === id && prev.mode === mode
        ? null
        : { id, mode },
    );
  }

  return (
    <>
      {rows.map((r) => {
        const isExpanded = expand?.id === r.id && expand.mode !== null;
        return (
          <RowGroup
            key={r.id}
            row={r}
            statusLabel={STATUS_LABEL[r.status]}
            requestTypeLabel={REQUEST_TYPE_LABEL[r.requestType]}
            badgeClass={statusBadgeClass(r.status)}
            reviewerId={reviewerId}
            expanded={isExpanded ? expand.mode : null}
            onToggle={(mode) => toggle(r.id, mode)}
            onClose={() => setExpand(null)}
          />
        );
      })}
    </>
  );
}

function RowGroup({
  row,
  statusLabel,
  requestTypeLabel,
  badgeClass,
  reviewerId,
  expanded,
  onToggle,
  onClose,
}: {
  row: Row;
  statusLabel: string;
  requestTypeLabel: string;
  badgeClass: string;
  reviewerId: string;
  expanded: ExpandMode;
  onToggle: (mode: Exclude<ExpandMode, null>) => void;
  onClose: () => void;
}) {
  const isPending = row.status === "submitted";

  const main: ReactNode = (
    <tr key={`${row.id}-main`} className="is-row-main">
      <td className="ot-queue-cell-date num">{row.workDateLabel}</td>
      <td className="ot-queue-cell-user">{row.userName}</td>
      <td>
        <span
          className={
            row.requestType === "pre"
              ? "badge ot-badge-pre"
              : "badge ot-badge-post"
          }
        >
          {requestTypeLabel}
        </span>
      </td>
      <td className="ot-queue-cell-time num">{row.timeRange}</td>
      <td className="num">{row.durationLabel}</td>
      <td className="ot-queue-cell-site" title={row.workSiteName}>
        {row.workSiteName}
      </td>
      <td className="ot-queue-cell-desc" title={row.description}>
        {row.description}
      </td>
      <td>
        <span className={badgeClass}>{statusLabel}</span>
      </td>
      <td className="ot-queue-cell-actions">
        {isPending ? (
          <div className="ot-action-row-inline">
            <ApproveButton id={row.id} reviewerId={reviewerId} />
            <button
              type="button"
              className={
                expanded === "send_back"
                  ? "ot-btn-warn ot-btn-sm is-active"
                  : "ot-btn-warn ot-btn-sm"
              }
              onClick={() => onToggle("send_back")}
              aria-expanded={expanded === "send_back"}
              aria-controls={`expand-${row.id}`}
            >
              差戻
            </button>
            <button
              type="button"
              className={
                expanded === "reject"
                  ? "ot-btn-danger ot-btn-sm is-active"
                  : "ot-btn-danger ot-btn-sm"
              }
              onClick={() => onToggle("reject")}
              aria-expanded={expanded === "reject"}
              aria-controls={`expand-${row.id}`}
            >
              却下
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>—</span>
        )}
      </td>
    </tr>
  );

  if (!isPending || expanded === null) {
    return <>{main}</>;
  }

  const isReject = expanded === "reject";

  return (
    <>
      {main}
      <tr key={`${row.id}-expand`} className="ot-review-expand-row">
        <td colSpan={9}>
          <div className="ot-review-expand-inner" id={`expand-${row.id}`}>
            <p className="ot-review-expand-title">
              {isReject ? "却下コメント（必須）" : "差戻コメント（必須）"}
            </p>
            <CommentForm
              key={`${row.id}-${expanded}`}
              id={row.id}
              reviewerId={reviewerId}
              mode={expanded}
              onCancel={onClose}
            />
          </div>
        </td>
      </tr>
    </>
  );
}

function ApproveButton({ id, reviewerId }: { id: string; reviewerId: string }) {
  const disabled = !reviewerId;
  return (
    <form action={approveRequestAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reviewerId" value={reviewerId} />
      <button
        type="submit"
        className="ot-btn-primary ot-btn-sm"
        disabled={disabled}
        title={disabled ? "承認者を選択してください" : undefined}
      >
        承認
      </button>
    </form>
  );
}

function CommentForm({
  id,
  reviewerId,
  mode,
  onCancel,
}: {
  id: string;
  reviewerId: string;
  mode: Exclude<ExpandMode, null>;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState("");
  const length = codePointLength(comment);
  const overLimit = length > REVIEW_COMMENT_MAX_CHARS;
  const empty = comment.trim().length === 0;
  const disabled = !reviewerId || empty || overLimit;
  const action = mode === "reject" ? rejectRequestAction : sendBackRequestAction;

  const charCountClass =
    overLimit
      ? "ot-charcount is-error"
      : length >= REVIEW_COMMENT_MAX_CHARS - 20
        ? "ot-charcount is-warn"
        : "ot-charcount";

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reviewerId" value={reviewerId} />
      <textarea
        name="comment"
        className="ot-textarea"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={
          mode === "reject"
            ? "例: 残業時間が事前合意の2時間を超過。今回は却下します。"
            : "例: 現場名を「東館A棟」にしてください。再申請をお願いします。"
        }
        aria-invalid={overLimit ? "true" : undefined}
        autoFocus
      />
      <div className={charCountClass} aria-live="polite">
        {length} / {REVIEW_COMMENT_MAX_CHARS}
      </div>
      {!reviewerId && (
        <div className="ot-field-error">
          承認者を選択してください
        </div>
      )}
      <div className="ot-review-expand-actions">
        <button
          type="button"
          className="ot-btn-ghost"
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          type="submit"
          className={mode === "reject" ? "ot-btn-danger" : "ot-btn-warn"}
          disabled={disabled}
        >
          {mode === "reject" ? "却下を確定" : "差戻を確定"}
        </button>
      </div>
    </form>
  );
}
