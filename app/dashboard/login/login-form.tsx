"use client";

import { useActionState, useId, useState } from "react";
import { dashboardLoginAction, type DashboardLoginState } from "./actions";

const initial: DashboardLoginState = null;

export function DashboardLoginForm() {
  const [state, formAction, pending] = useActionState(
    dashboardLoginAction,
    initial,
  );
  const emailId = useId();
  const pwId = useId();
  const [show, setShow] = useState(false);
  const error = state && !state.ok ? state.error : null;

  return (
    <form className="dash-login-card" action={formAction} noValidate>
      {error && (
        <div className="dash-login-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <div className="dash-login-field">
        <label htmlFor={emailId} className="dash-login-label">
          メールアドレス
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          className="dash-login-input"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          required
          disabled={pending}
        />
      </div>

      <div className="dash-login-field">
        <label htmlFor={pwId} className="dash-login-label">
          パスワード
        </label>
        <div className="dash-login-pw">
          <input
            id={pwId}
            name="password"
            type={show ? "text" : "password"}
            className="dash-login-input"
            autoComplete="current-password"
            required
            disabled={pending}
          />
          <button
            type="button"
            className="dash-login-toggle"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
            aria-pressed={show}
          >
            {show ? "隠す" : "表示"}
          </button>
        </div>
      </div>

      <button
        type="submit"
        className="dash-login-submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
