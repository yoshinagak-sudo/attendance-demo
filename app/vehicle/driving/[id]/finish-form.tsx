"use client";

import { useActionState, useRef } from "react";
import { finishDriving, type ActionResult } from "@/app/vehicle/actions";
import { OdometerCamera } from "@/app/vehicle/_components/OdometerCamera";

const initial: ActionResult | null = null;

export function FinishDrivingForm({
  drivingLogId,
  startOdometer,
}: {
  drivingLogId: string;
  startOdometer: number;
}) {
  const [state, formAction, pending] = useActionState(finishDriving, initial);
  const errors = state && !state.ok ? state.errors : {};
  const formError = state && !state.ok ? state.formError : null;
  const odoInputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="ot-form">
      <input type="hidden" name="drivingLogId" value={drivingLogId} />

      {formError && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <div className="ot-banner-body">{formError}</div>
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="endOdometer">
          帰着時メーター（km）
        </label>
        <input
          ref={odoInputRef}
          id="endOdometer"
          name="endOdometer"
          type="number"
          inputMode="numeric"
          min={startOdometer}
          step={1}
          required
          className="ot-input"
        />
        <OdometerCamera
          onResult={(v) => {
            if (odoInputRef.current) {
              odoInputRef.current.value = String(v);
              odoInputRef.current.focus();
            }
          }}
        />
        <p className="ot-field-help">
          出発時: <strong className="num">{startOdometer.toLocaleString()}</strong> km 以上を入力
        </p>
        {errors.endOdometer && <p className="ot-field-error">{errors.endOdometer}</p>}
      </div>

      <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block" disabled={pending}>
        {pending ? "登録中…" : "帰着を登録"}
      </button>
    </form>
  );
}
