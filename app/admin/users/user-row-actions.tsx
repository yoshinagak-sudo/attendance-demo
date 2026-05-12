"use client";

import { useActionState, useEffect, useState } from "react";
import {
  resetPasswordAction,
  toggleUserActiveAction,
  type ResetPasswordState,
  type ToggleActiveState,
} from "./actions";

type Props = {
  userId: string;
  userName: string;
  isActive: boolean;
  hasLoginId: boolean;
  disableDeactivate: boolean;
  disableDeactivateReason?: string;
};

export function UserRowActions({
  userId,
  userName,
  isActive,
  hasLoginId,
  disableDeactivate,
  disableDeactivateReason,
}: Props) {
  const [resetState, resetFormAction, resetPending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, null);

  const [toggleState, toggleFormAction, togglePending] = useActionState<
    ToggleActiveState,
    FormData
  >(toggleUserActiveAction, null);

  // resetState の表示は「最新の成功 (ok:true)」だけモーダルに乗せる
  const [revealed, setRevealed] = useState<
    | { password: string; userId: string; userName: string }
    | null
  >(null);

  useEffect(() => {
    if (resetState && resetState.ok && resetState.userId === userId) {
      setRevealed({
        password: resetState.password,
        userId: resetState.userId,
        userName: resetState.userName,
      });
    }
  }, [resetState, userId]);

  const closeModal = () => setRevealed(null);

  const resetError =
    resetState && !resetState.ok ? resetState.error : null;
  const toggleError =
    toggleState && !toggleState.ok ? toggleState.error : null;

  // 無効化ボタンを止める理由のうち、サーバー側の結果も尊重する
  const cannotDeactivate = disableDeactivate;

  return (
    <>
      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        {/* パスワード再発行 */}
        <form action={resetFormAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            className="ot-btn-secondary ot-btn-sm"
            disabled={resetPending || !hasLoginId}
            title={
              !hasLoginId
                ? "loginId が未設定のためパスワードを再発行できません"
                : `${userName} のパスワードを再発行`
            }
          >
            {resetPending ? "再発行中…" : "PW再発行"}
          </button>
        </form>

        {/* 有効/無効化 */}
        <form action={toggleFormAction}>
          <input type="hidden" name="userId" value={userId} />
          {isActive ? (
            <button
              type="submit"
              className="ot-btn-warn ot-btn-sm"
              disabled={togglePending || cannotDeactivate}
              title={cannotDeactivate ? disableDeactivateReason : undefined}
            >
              {togglePending ? "更新中…" : "無効化"}
            </button>
          ) : (
            <button
              type="submit"
              className="ot-btn-ghost ot-btn-sm"
              disabled={togglePending}
            >
              {togglePending ? "更新中…" : "有効化"}
            </button>
          )}
        </form>
      </div>

      {/* エラー（最新分のみインライン表示） */}
      {(resetError || toggleError) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: "var(--danger)",
            fontWeight: 600,
            letterSpacing: 0.02,
            textAlign: "right",
          }}
          role="alert"
        >
          {resetError ?? toggleError}
        </div>
      )}

      {/* 再発行モーダル */}
      {revealed && (
        <PasswordRevealModal
          userName={revealed.userName}
          password={revealed.password}
          onClose={closeModal}
        />
      )}
    </>
  );
}

function PasswordRevealModal({
  userName,
  password,
  onClose,
}: {
  userName: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Esc で閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: テキスト選択
      const sel = window.getSelection();
      const range = document.createRange();
      const node = document.getElementById("password-reveal-value");
      if (node && sel) {
        range.selectNodeContents(node);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  return (
    <div
      className="password-reveal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reveal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="password-reveal-card">
        <h3 id="password-reveal-title" className="password-reveal-title">
          {userName} さんの新しいパスワード
        </h3>
        <p className="password-reveal-sub">
          下記のパスワードを本人に伝えてください。閉じると再表示はできません。
        </p>

        <div className="password-reveal-value-row">
          <div
            id="password-reveal-value"
            className="password-reveal-value"
            aria-label="新しいパスワード"
          >
            {password}
          </div>
          <button
            type="button"
            className={
              copied
                ? "password-reveal-copy is-copied"
                : "password-reveal-copy"
            }
            onClick={handleCopy}
          >
            {copied ? "コピー済" : "コピー"}
          </button>
        </div>

        <p className="password-reveal-warn">
          ⚠ このパスワードは今だけ表示されています。閉じた後は二度と確認できません。
          メモやチャットで本人に渡してください。
        </p>

        <div className="password-reveal-actions">
          <button
            type="button"
            className="password-reveal-close"
            onClick={onClose}
            autoFocus
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
