"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const GENERIC_ERROR =
  "ログイン情報が正しくないか、ロックされています";

type LoginFormProps = {
  next: string;
  lineError?: string | null;
};

function LineIcon() {
  // LINE風の吹き出し型アイコン（商標ロゴは使わない・自前で描画）
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 3C6.48 3 2 6.69 2 11.24c0 4.08 3.55 7.5 8.34 8.13.32.07.77.21.88.49.1.25.07.65.03.91l-.14.86c-.04.25-.21.99.87.54 1.07-.45 5.81-3.42 7.93-5.86 1.47-1.62 2.09-3.27 2.09-5.07C22 6.69 17.52 3 12 3z"
      />
    </svg>
  );
}

export function LoginForm({ next, lineError }: LoginFormProps) {
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
        const data = (await res.json().catch(() => null)) as
          | { user?: { role?: string } }
          | null;
        const role = data?.user?.role;
        const fallback = role === "manager" || role === "developer" ? "/admin" : "/";
        const target = !next || next === "/" ? fallback : next;
        router.replace(target);
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
      {lineError && (
        <div className="login-error" role="alert" aria-live="polite">
          {lineError}
        </div>
      )}
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

      <div className="login-divider" role="separator" aria-label="または">
        <span>または</span>
      </div>

      <a
        href="/api/auth/line/start"
        className="login-line-btn"
        aria-disabled={pending ? "true" : undefined}
        tabIndex={pending ? -1 : undefined}
        onClick={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <LineIcon />
        <span>LINEでログイン</span>
      </a>

      <p className="login-help">
        ログイン情報を忘れた場合は管理者にお問い合わせください
      </p>
    </form>
  );
}
