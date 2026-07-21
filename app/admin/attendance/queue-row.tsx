"use client";

import { useState } from "react";
import {
  approveAttendanceAction,
  rejectAttendanceAction,
  sendBackAttendanceAction,
} from "@/app/attendance/actions";
import { REVIEW_COMMENT_MAX_CHARS } from "@/lib/attendance-request";

type Row = {
  id: string;
  workDateLabel: string;
  userName: string;
  categoryLabel: string;
  requestTypeLabel: string;
  contents: string;
  description: string;
  statusLabel: string;
  statusClass: string;
  isSubmitted: boolean;
};

type ExpandMode = null | "reject" | "send_back";

export function AttendanceQueueRow({ row }: { row: Row }) {
  const [mode, setMode] = useState<ExpandMode>(null);
  const [comment, setComment] = useState("");

  return (
    <>
      <tr>
        <td className="num">{row.workDateLabel}</td>
        <td>{row.userName}</td>
        <td>{row.categoryLabel}</td>
        <td>{row.requestTypeLabel}</td>
        <td>{row.contents}</td>
        <td
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 240,
          }}
          title={row.description}
        >
          {row.description || "—"}
        </td>
        <td>
          <span className={row.statusClass}>{row.statusLabel}</span>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {row.isSubmitted ? (
            <div style={{ display: "flex", gap: 4 }}>
              <form action={approveAttendanceAction}>
                <input type="hidden" name="id" value={row.id} />
                <button type="submit" className="ot-btn-primary ot-btn-sm">
                  承認
                </button>
              </form>
              <button
                type="button"
                className="ot-btn-warn ot-btn-sm"
                onClick={() => setMode(mode === "send_back" ? null : "send_back")}
              >
                差戻
              </button>
              <button
                type="button"
                className="ot-btn-ghost ot-btn-sm"
                onClick={() => setMode(mode === "reject" ? null : "reject")}
                style={{ color: "var(--danger)" }}
              >
                却下
              </button>
            </div>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
          )}
        </td>
      </tr>
      {mode && (
        <tr>
          <td colSpan={8} style={{ background: "var(--surface-1)" }}>
            <form
              action={mode === "reject" ? rejectAttendanceAction : sendBackAttendanceAction}
              style={{ display: "flex", gap: 8, alignItems: "start", padding: 8 }}
            >
              <input type="hidden" name="id" value={row.id} />
              <textarea
                name="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={`${mode === "reject" ? "却下" : "差戻"}理由（必須・${REVIEW_COMMENT_MAX_CHARS}文字以内）`}
                rows={2}
                required
                maxLength={REVIEW_COMMENT_MAX_CHARS}
                className="ot-input"
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className={mode === "reject" ? "ot-btn-ghost ot-btn-sm" : "ot-btn-warn ot-btn-sm"}
                style={mode === "reject" ? { color: "var(--danger)" } : undefined}
              >
                {mode === "reject" ? "却下する" : "差し戻す"}
              </button>
              <button
                type="button"
                className="ot-btn-ghost ot-btn-sm"
                onClick={() => setMode(null)}
              >
                取消
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
