"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ot_admin_reviewer_id";

type Manager = {
  id: string;
  name: string;
};

type Props = {
  managers: Manager[];
};

/**
 * 承認者として記録するユーザーを選ぶセレクト。
 * - 値は localStorage に保存し、次回も維持
 * - 同じページ内に hidden input #ot-reviewer-id-mirror として書き込まれた値を、
 *   各 form の reviewerId hidden input が DOM 経由で参照する代わりに、
 *   QueueRows 側でも storage event を購読して同期更新する
 *
 * SSR 対策: マウントまでは selected="" の状態で出す
 */
export function ReviewerSelect({ managers }: Props) {
  const [value, setValue] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && managers.some((m) => m.id === saved)) {
        setValue(saved);
        broadcast(saved);
        return;
      }
    } catch {
      // ignore
    }
    // 未保存なら先頭の manager を初期値に
    if (managers.length > 0) {
      setValue(managers[0].id);
      broadcast(managers[0].id);
    }
  }, [managers]);

  function handleChange(next: string) {
    setValue(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    broadcast(next);
  }

  return (
    <div className="ot-toolbar-field">
      <label className="ot-toolbar-label" htmlFor="ot-reviewer-select">
        承認者として記録
      </label>
      <select
        id="ot-reviewer-select"
        className="ot-select"
        value={mounted ? value : ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={managers.length === 0}
        style={{ minWidth: 200 }}
      >
        {!mounted && <option value="">読み込み中…</option>}
        {mounted && managers.length === 0 && (
          <option value="">（承認者未登録）</option>
        )}
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * 同じタブ内の全 form に reviewerId を伝搬。
 * CustomEvent で hidden input を更新する。
 */
function broadcast(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ot:reviewer-change", { detail: { id } }),
  );
}

export const REVIEWER_STORAGE_KEY = STORAGE_KEY;
