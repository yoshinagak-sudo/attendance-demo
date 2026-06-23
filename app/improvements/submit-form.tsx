"use client";

/**
 * 改善依頼 投稿フォーム（一般ユーザー用）
 *
 * - useActionState(submitImprovementAction) で送信
 * - textarea は必須・最大1000文字・残文字数カウンタを ot-charcount 既存トークンに揃える
 * - 送信成功でフォームをクリアし、success バナーをインラインで表示
 * - 失敗時は ot-banner-danger でインラインエラー
 */

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Send, Check, Loader2 } from "lucide-react";
import { submitImprovementAction, type SubmitState } from "./actions";

const MAX_BODY = 1000;
const WARN_REMAINING = 100; // 残り100文字を切ったら warn 表示

function codePointLength(s: string): number {
  // 絵文字や JIS 外字を1文字として数える既存方針に合わせるが、
  // submit-form では絵文字使わない前提なので length でも十分だが念のため統一
  let n = 0;
  for (const _ of s) n++;
  return n;
}

export function SubmitForm() {
  const textareaId = useId();

  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitImprovementAction,
    null,
  );
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // 成功 → 表示中の id を持っておき、新しい成功ごとにバナーを差し替える
  const [shownSuccessId, setShownSuccessId] = useState<string | null>(null);

  // 送信成功時にフォームをリセット
  useEffect(() => {
    if (state && state.ok && state.id !== shownSuccessId) {
      setBody("");
      setShownSuccessId(state.id);
      formRef.current?.reset();
    }
  }, [state, shownSuccessId]);

  const len = codePointLength(body);
  const remaining = MAX_BODY - len;
  const isOver = remaining < 0;
  const isWarn = !isOver && remaining <= WARN_REMAINING;

  const counterClass = isOver
    ? "ot-charcount is-error"
    : isWarn
      ? "ot-charcount is-warn"
      : "ot-charcount";

  const submitDisabled = pending || len === 0 || isOver;
  const formError = state && !state.ok ? state.error : null;
  const isSuccess = state?.ok === true;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="imp-submit-form"
      noValidate
      aria-describedby={formError ? `${textareaId}-error` : undefined}
    >
      {formError && (
        <div
          id={`${textareaId}-error`}
          className="ot-banner ot-banner-danger"
          role="alert"
          aria-live="polite"
        >
          <div className="ot-banner-body">{formError}</div>
        </div>
      )}

      <label className="ot-field-label" htmlFor={textareaId}>
        改善してほしい内容
        <span className="ot-field-required" aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        id={textareaId}
        name="body"
        className="ot-textarea"
        rows={5}
        required
        maxLength={MAX_BODY * 4 /* surrogate pair を考慮した安全な大値 */}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        aria-invalid={isOver || !!formError ? "true" : undefined}
        placeholder="例: 打刻画面の名前ボタンが小さく、押し間違いが多い。もう少し大きくしてほしい。"
      />
      <div className={counterClass} aria-live="polite">
        {len} / {MAX_BODY}
        {isOver && (
          <span style={{ marginLeft: 8 }}>
            ({Math.abs(remaining)} 文字オーバー)
          </span>
        )}
      </div>
      <p className="ot-field-help">
        匿名ではありません。投稿者と日時が管理者から見えます。
      </p>

      <div className="imp-submit-actions">
        <span className="ot-field-help" style={{ margin: 0 }}>
          送信後、管理者が内容を確認します（即時の返信はありません）
        </span>
        <button
          type="submit"
          className="ot-btn-primary"
          disabled={submitDisabled}
          aria-busy={pending}
        >
          {pending ? (
            <span className="ot-submitting">
              <Loader2
                width={14}
                height={14}
                style={{ animation: "ot-spin 0.7s linear infinite" }}
                aria-hidden="true"
              />
              送信中…
            </span>
          ) : (
            <>
              <Send width={14} height={14} aria-hidden="true" />
              改善依頼を送信
            </>
          )}
        </button>
      </div>

      {isSuccess && (
        <div
          className="imp-success"
          role="status"
          aria-live="polite"
          // success バナーの id を key にしてマウントしなおし、視覚的に変化を出す
          key={state.id}
        >
          <Check className="imp-success-icon" aria-hidden="true" />
          <div>
            ありがとうございます。改善依頼を受け付けました。
            <br />
            内容は「あなたの改善依頼履歴」に表示されます。
          </div>
        </div>
      )}
    </form>
  );
}
