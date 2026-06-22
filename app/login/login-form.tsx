"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const GENERIC_ERROR =
  "ログイン情報が正しくないか、ロックされています";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const loginIdId = useId();
  const passwordId = useId();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const trimmedId = loginId.trim();
    if (!trimmedId || !password) {
      setError(GENERIC_ERROR);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: trimmedId, password }),
      });
      if (res.ok) {
        // Cookie がセットされた直後は server-side のセッションキャッシュを更新するため refresh
        router.replace(next || "/");
        router.refresh();
        return;
      }
      // 401 / 429 / 400 すべて同じ汎用メッセージ（user enumeration 防止）
      setError(GENERIC_ERROR);
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください");
    } finally {
      setPending(false);
    }
  };

  const invalid = !!error;

  return (
    <form className="login-card" onSubmit={onSubmit} noValidate>
      {error && (
        <div className="login-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <div className="login-field">
        <label htmlFor={loginIdId} className="login-label">
          メールアドレス
        </label>
        <input
          id={loginIdId}
          name="loginId"
          type="email"
          className="login-input"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          required
          aria-invalid={invalid ? "true" : undefined}
          disabled={pending}
          placeholder="例: hongo_takuya@ninau.jp"
        />
      </div>

      <div className="login-field">
        <label htmlFor={passwordId} className="login-label">
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={pending}
            aria-invalid={invalid ? "true" : undefined}
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
      </div>

      <button
        type="submit"
        className="login-submit"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "ログイン中…" : "ログイン"}
      </button>

      <p className="login-help">
        ログイン情報を忘れた場合は管理者にお問い合わせください
      </p>
    </form>
  );
}
