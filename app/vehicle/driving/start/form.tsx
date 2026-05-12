"use client";

import { useActionState } from "react";
import { startDriving, type ActionResult } from "@/app/vehicle/actions";

const initial: ActionResult | null = null;

export function StartDrivingForm({
  vehicleId,
  sites,
  initialOdometer,
}: {
  vehicleId: string;
  sites: { id: string; name: string }[];
  initialOdometer: number | null;
}) {
  const [state, formAction, pending] = useActionState(startDriving, initial);
  const errors = state && !state.ok ? state.errors : {};
  const formError = state && !state.ok ? state.formError : null;

  return (
    <form action={formAction} className="ot-form">
      <input type="hidden" name="vehicleId" value={vehicleId} />

      {formError && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <div className="ot-banner-body">{formError}</div>
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="startOdometer">
          出発時メーター（km）
        </label>
        <input
          id="startOdometer"
          name="startOdometer"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          defaultValue={initialOdometer ?? undefined}
          className="ot-input"
        />
        {errors.startOdometer && <p className="ot-field-error">{errors.startOdometer}</p>}
        {initialOdometer !== null && (
          <p className="ot-field-help">
            前回帰着時: <strong className="num">{initialOdometer.toLocaleString()}</strong> km
          </p>
        )}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="purpose">目的</label>
        <input
          id="purpose"
          name="purpose"
          type="text"
          required
          placeholder="例: 据付 / 保守点検 / 資材引取"
          className="ot-input"
        />
        {errors.purpose && <p className="ot-field-error">{errors.purpose}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="workSiteName">行先（現場名）</label>
        <input
          id="workSiteName"
          name="workSiteName"
          type="text"
          required
          list="site-suggestions"
          className="ot-input"
        />
        <datalist id="site-suggestions">
          {sites.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        {errors.workSiteName && <p className="ot-field-error">{errors.workSiteName}</p>}
      </div>

      <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block" disabled={pending}>
        {pending ? "登録中…" : "出発を登録"}
      </button>
    </form>
  );
}
