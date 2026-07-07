"use client";

import { useActionState, useEffect, useState } from "react";
import {
  resetPasswordAction,
  toggleUserActiveAction,
  changeUserRoleAction,
  deleteUserAction,
  type ResetPasswordState,
  type ToggleActiveState,
  type ChangeRoleState,
  type DeleteUserState,
} from "./actions";

type RoleValue = "member" | "manager" | "developer";

type Props = {
  userId: string;
  userName: string;
  isActive: boolean;
  hasLoginId: boolean;
  disableDeactivate: boolean;
  disableDeactivateReason?: string;
  disableDelete?: boolean;
  disableDeleteReason?: string;
};

export function UserRowActions({
  userId,
  userName,
  isActive,
  hasLoginId,
  disableDeactivate,
  disableDeactivateReason,
  disableDelete,
  disableDeleteReason,
}: Props) {
  const [resetState, resetFormAction, resetPending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPasswordAction, null);

  const [toggleState, toggleFormAction, togglePending] = useActionState<
    ToggleActiveState,
    FormData
  >(toggleUserActiveAction, null);

  const [deleteState, deleteFormAction, deletePending] = useActionState<
    DeleteUserState,
    FormData
  >(deleteUserAction, null);

  // resetState の表示は「最新の成功 (ok:true)」だけモーダルに乗せる
  const [revealed, setRevealed] = useState<
    | { password: string; userId: string; userName: string }
    | null
  >(null);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);

  useEffect(() => {
    if (resetState && resetState.ok && resetState.userId === userId) {
      setRevealed({
        password: resetState.password,
        userId: resetState.userId,
        userName: resetState.userName,
      });
    }
  }, [resetState, userId]);

  useEffect(() => {
    if (deleteState && deleteState.ok && deleteState.userId === userId) {
      setDeletePromptOpen(false);
    }
  }, [deleteState, userId]);

  const closeModal = () => setRevealed(null);

  const resetError =
    resetState && !resetState.ok ? resetState.error : null;
  const toggleError =
    toggleState && !toggleState.ok ? toggleState.error : null;
  const deleteError =
    deleteState && !deleteState.ok ? deleteState.error : null;

  // 無効化ボタンを止める理由のうち、サーバー側の結果も尊重する
  const cannotDeactivate = disableDeactivate;
  const cannotDelete = disableDelete ?? false;

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

        {/* 削除（不可逆） */}
        <button
          type="button"
          onClick={() => setDeletePromptOpen(true)}
          className="ot-btn-ghost ot-btn-sm"
          style={{ color: "var(--danger)", fontWeight: 700 }}
          disabled={cannotDelete}
          title={cannotDelete ? disableDeleteReason : `${userName} を完全に削除`}
        >
          削除
        </button>
      </div>

      {/* エラー（最新分のみインライン表示） */}
      {(resetError || toggleError || deleteError) && (
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
          {resetError ?? toggleError ?? deleteError}
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

      {/* 削除確認モーダル */}
      {deletePromptOpen && (
        <DeleteConfirmModal
          userId={userId}
          userName={userName}
          onClose={() => setDeletePromptOpen(false)}
          formAction={deleteFormAction}
          pending={deletePending}
          errorMessage={deleteError}
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

function DeleteConfirmModal({
  userId,
  userName,
  onClose,
  formAction,
  pending,
  errorMessage,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
  formAction: (fd: FormData) => void;
  pending: boolean;
  errorMessage: string | null;
}) {
  const [typedName, setTypedName] = useState("");
  const matches = typedName.trim() === userName;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="password-reveal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="password-reveal-card">
        <h3 id="delete-confirm-title" className="password-reveal-title">
          {userName} さんを削除しますか？
        </h3>
        <p className="password-reveal-sub" style={{ color: "var(--danger)" }}>
          この操作は<strong>取り消せません</strong>。<br />
          このユーザーの<strong>打刻・残業申請・車両割当・給油・運行・日報</strong>もすべて削除されます。
        </p>
        <p className="password-reveal-sub" style={{ marginTop: 8 }}>
          間違えて削除しないよう、下の欄に本人の氏名（<strong>{userName}</strong>）を入力してください。
        </p>
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="confirmName" value={typedName.trim()} />
          <div style={{ marginTop: 8 }}>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={userName}
              className="ot-input"
              autoFocus
              aria-label="削除確認用の氏名"
            />
          </div>
          {errorMessage && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--danger)",
                fontWeight: 600,
              }}
            >
              {errorMessage}
            </div>
          )}
          <div
            className="password-reveal-actions"
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button
              type="button"
              className="ot-btn-ghost ot-btn-sm"
              onClick={onClose}
              disabled={pending}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="ot-btn-warn ot-btn-sm"
              disabled={!matches || pending}
              title={
                !matches ? "氏名を正確に入力すると削除できます" : "完全に削除"
              }
              style={{ fontWeight: 700 }}
            >
              {pending ? "削除中…" : "削除する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type RoleSelectorProps = {
  userId: string;
  currentRole: RoleValue;
  disabled: boolean;
  disabledReason?: string;
  /** 最後の管理者の降格を抑止（member 選択肢を不可化） */
  lockedToAdmin: boolean;
};

const ROLE_OPTIONS: { value: RoleValue; label: string; className: string }[] = [
  { value: "developer", label: "開発者", className: "admin-users-role-developer" },
  { value: "manager", label: "管理者", className: "admin-users-role-manager" },
  { value: "member", label: "一般", className: "admin-users-role-member" },
];

export function RoleSelector({
  userId,
  currentRole,
  disabled,
  disabledReason,
  lockedToAdmin,
}: RoleSelectorProps) {
  const [state, formAction, pending] = useActionState<ChangeRoleState, FormData>(
    changeUserRoleAction,
    null,
  );

  const [pendingRole, setPendingRole] = useState<RoleValue | null>(null);
  const errorForThisRow = state && !state.ok ? state.error : null;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as RoleValue;
    if (newRole === currentRole) return;
    setPendingRole(newRole);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("newRole", newRole);
    formAction(fd);
  };

  // 完了したら pending 表示をクリア
  useEffect(() => {
    if (!pending) setPendingRole(null);
  }, [pending]);

  const effectiveRole = pendingRole ?? currentRole;
  const currentClass =
    ROLE_OPTIONS.find((o) => o.value === effectiveRole)?.className ??
    "admin-users-role-member";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span className={currentClass} style={{ position: "relative" }}>
        <select
          value={effectiveRole}
          onChange={onChange}
          disabled={disabled || pending}
          title={disabled ? disabledReason : undefined}
          aria-label="ロールを変更"
          style={{
            appearance: "none",
            background: "transparent",
            border: "none",
            color: "inherit",
            font: "inherit",
            cursor: disabled || pending ? "not-allowed" : "pointer",
            padding: "0 14px 0 0",
          }}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={
                lockedToAdmin &&
                opt.value === "member" &&
                (currentRole === "manager" || currentRole === "developer")
              }
            >
              {opt.label}（{opt.value}）
            </option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 2,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            opacity: 0.6,
            pointerEvents: "none",
          }}
        >
          ▼
        </span>
      </span>
      {errorForThisRow && (
        <span
          role="alert"
          style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}
        >
          {errorForThisRow}
        </span>
      )}
    </span>
  );
}
