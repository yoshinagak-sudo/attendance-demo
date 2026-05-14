"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="ot-btn-ghost"
      onClick={() => window.print()}
    >
      印刷
    </button>
  );
}
