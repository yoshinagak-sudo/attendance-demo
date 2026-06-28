"use client";

/**
 * LINE 初回ログイン名前確定フォーム
 *
 * - useActionState(finishLineSignupAction) で送信
 * - 成功時は Server Action 側で session 発行＋ redirect("/") するため、
 *   ここで ok:true を描画分岐する必要はない（pending と error の2状態だけ見れば良い）
 * - 既存ログイン/新規登録画面の視覚言語（.login-* クラス）をそのまま流用
 */

import { useActionState, useId } from "react";
import { User } from "lucide-react";

import { finishLineSignupAction, type LineSignupState } from "./actions";

const initial: LineSignupState = null;

type LineSignupFormProps = {
  initialName: string;
};

export function LineSignupForm({ initialName }: LineSignupFormProps) {
  const nameId = useId();
  const [state, formAction, pending] = useActionState(
    finishLineSignupAction,
    initial,
  );

  const error = state && !state.ok ? state.error : null;
  const invalid = !!error;

  return (
    <>
      {error && (
        <div className="login-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <form action={formAction} noValidate style={{ display: "contents" }}>
        <div className="login-field">
          <label htmlFor={nameId} className="login-label">
            <User
              aria-hidden="true"
              focusable="false"
              className="login-label-icon"
            />
            お名前
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            className="login-input"
            autoComplete="name"
            maxLength={60}
            required
            disabled={pending}
            defaultValue={initialName}
            aria-invalid={invalid ? "true" : undefined}
            aria-describedby={`${nameId}-help`}
            placeholder="例: 山田 太郎"
          />
          <p id={`${nameId}-help`} className="login-field-help">
            会社で表示される名前を入力してください
          </p>
        </div>

        <button
          type="submit"
          className="login-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "登録中…" : "登録を完了する"}
        </button>
      </form>
    </>
  );
}
