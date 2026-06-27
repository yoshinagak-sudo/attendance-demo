"use client";

/**
 * 新規ユーザー登録フォーム
 *
 * - signupAction を useActionState で呼ぶ
 * - 成功時は Server Action 側で redirect("/") するため、ここに ok:true が
 *   返って戻ってくることは基本ない（描画分岐は error 用のみ）
 * - 既存ログイン画面の視覚言語（.login-* クラス）を最大限流用する
 */

import { useId, useState } from "react";
import { useActionState } from "react";
import { Mail, KeyRound, User } from "lucide-react";

import { signupAction, type SignupState } from "./actions";

const initial: SignupState = null;

export function SignupForm() {
  const nameId = useId();
  const loginIdId = useId();
  const passwordId = useId();
  const passwordConfirmId = useId();

  const [state, formAction, pending] = useActionState(signupAction, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  const error = state && !state.ok ? state.error : null;
  const invalid = !!error;

  return (
    <div className="login-card">
      {error && (
        <div className="login-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <form action={formAction} noValidate style={{ display: "contents" }}>
        <div className="login-field">
          <label htmlFor={nameId} className="login-label">
            <User aria-hidden="true" focusable="false" className="login-label-icon" />
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
            aria-invalid={invalid ? "true" : undefined}
            placeholder="例: 山田 太郎"
          />
        </div>

        <div className="login-field">
          <label htmlFor={loginIdId} className="login-label">
            <Mail aria-hidden="true" focusable="false" className="login-label-icon" />
            メールアドレス
          </label>
          <input
            id={loginIdId}
            name="loginId"
            type="email"
            className="login-input"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            required
            disabled={pending}
            aria-invalid={invalid ? "true" : undefined}
            placeholder="例: taro@example.com"
          />
        </div>

        <div className="login-field">
          <label htmlFor={passwordId} className="login-label">
            <KeyRound aria-hidden="true" focusable="false" className="login-label-icon" />
            パスワード
          </label>
          <div
            className="login-input-with-button"
            aria-invalid={invalid ? "true" : undefined}
          >
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={100}
              required
              disabled={pending}
              aria-invalid={invalid ? "true" : undefined}
              aria-describedby={`${passwordId}-help`}
            />
            <button
              type="button"
              className="login-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
              tabIndex={-1}
            >
              {showPassword ? "隠す" : "表示"}
            </button>
          </div>
          <p id={`${passwordId}-help`} className="login-field-help">
            8文字以上100文字以内
          </p>
        </div>

        <div className="login-field">
          <label htmlFor={passwordConfirmId} className="login-label">
            <KeyRound aria-hidden="true" focusable="false" className="login-label-icon" />
            パスワード（確認用）
          </label>
          <div
            className="login-input-with-button"
            aria-invalid={invalid ? "true" : undefined}
          >
            <input
              id={passwordConfirmId}
              name="passwordConfirm"
              type={showPasswordConfirm ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={100}
              required
              disabled={pending}
              aria-invalid={invalid ? "true" : undefined}
            />
            <button
              type="button"
              className="login-toggle"
              onClick={() => setShowPasswordConfirm((v) => !v)}
              aria-pressed={showPasswordConfirm}
              aria-label={
                showPasswordConfirm ? "パスワードを隠す" : "パスワードを表示"
              }
              tabIndex={-1}
            >
              {showPasswordConfirm ? "隠す" : "表示"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="login-submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "作成中…" : "アカウントを作成してログイン"}
        </button>
      </form>
    </div>
  );
}
