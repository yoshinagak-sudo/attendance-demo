"use client";

/**
 * LINE 連携解除ボタン
 *
 * - 既存の Server Action (unlinkLineAction) を form action で起動
 * - 送信前に confirm() で意思確認を挟む（キャンセル時は preventDefault）
 * - pending 中は disabled + aria-busy + ラベル切替（"解除中…"）
 *   pending 取得は useFormStatus（React 19 / Next.js 16 標準）
 */

import { useFormStatus } from "react-dom";
import { Unlink } from "lucide-react";
import { unlinkLineAction } from "./actions";

const CONFIRM_MESSAGE =
  "LINE 連携を解除しますか？以降は LINE では入れなくなります";

function InnerButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="ot-btn-danger settings-unlink-btn"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      <Unlink width={14} height={14} aria-hidden="true" />
      {pending ? "解除中…" : "LINE 連携を解除"}
    </button>
  );
}

export function UnlinkLineButton() {
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(CONFIRM_MESSAGE)) {
      e.preventDefault();
    }
  };

  return (
    <form
      action={unlinkLineAction}
      onSubmit={onSubmit}
      className="settings-action-form"
    >
      <InnerButton />
    </form>
  );
}
