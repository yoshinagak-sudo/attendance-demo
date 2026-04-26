"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = {
  nextPath: string;
  pinRequired: boolean;
};

export function PinForm({ nextPath, pinRequired }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const value = pin.trim();
    if (pinRequired && !/^\d{4}$/.test(value)) {
      setError("4桁の数字で入力してください");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value }),
        });

        if (res.status === 429) {
          setError("試行回数が多すぎます。1分後に再度お試しください");
          return;
        }
        if (res.status === 401) {
          setError("PINが違います");
          setPin("");
          return;
        }
        if (!res.ok) {
          setError("認証に失敗しました。時間をおいて再度お試しください");
          return;
        }

        // 認証成功 → 指定の next に遷移
        router.push(nextPath);
        router.refresh();
      } catch {
        setError("通信エラーが発生しました");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">{error}</div>
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="pin-input">
          PIN（4桁）
          {pinRequired && <span className="ot-field-required">*</span>}
        </label>
        <input
          id="pin-input"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="ot-input ot-auth-input"
          placeholder={pinRequired ? "••••" : "(空のまま)"}
          aria-invalid={error ? "true" : undefined}
          disabled={isPending}
        />
        {!pinRequired && (
          <p className="ot-field-help">
            DEMO MODE では空のまま送信して構いません
          </p>
        )}
      </div>

      <button
        type="submit"
        className="ot-btn-primary ot-btn-lg ot-btn-block"
        disabled={isPending}
      >
        {isPending ? (
          <span className="ot-submitting">
            <span className="ot-spinner" aria-hidden="true" />
            認証中…
          </span>
        ) : (
          "認証する"
        )}
      </button>
    </form>
  );
}
