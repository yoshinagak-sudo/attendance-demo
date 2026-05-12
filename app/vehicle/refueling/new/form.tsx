"use client";

import { useActionState } from "react";
import { createRefueling, type ActionResult } from "@/app/vehicle/actions";

const initial: ActionResult | null = null;

export function RefuelingForm({
  vehicles,
  defaultVehicleId,
  defaultDate,
}: {
  vehicles: { id: string; plate: string; model: string }[];
  defaultVehicleId: string | null;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(createRefueling, initial);
  const errors = state && !state.ok ? state.errors : {};
  const formError = state && !state.ok ? state.formError : null;

  return (
    <form action={formAction} className="ot-form">
      {formError && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <div className="ot-banner-body">{formError}</div>
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="vehicleId">車両</label>
        <select
          id="vehicleId"
          name="vehicleId"
          required
          className="ot-input"
          defaultValue={defaultVehicleId ?? ""}
        >
          <option value="">選択してください</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate}（{v.model}）
            </option>
          ))}
        </select>
        {errors.vehicleId && <p className="ot-field-error">{errors.vehicleId}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="refuelDate">給油日</label>
        <input
          id="refuelDate"
          name="refuelDate"
          type="date"
          required
          defaultValue={defaultDate}
          className="ot-input"
        />
        {errors.refuelDate && <p className="ot-field-error">{errors.refuelDate}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="liters">給油量（L）</label>
        <input
          id="liters"
          name="liters"
          type="number"
          inputMode="decimal"
          min={0.1}
          step={0.1}
          required
          className="ot-input"
        />
        {errors.liters && <p className="ot-field-error">{errors.liters}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="amountJpy">金額（円）</label>
        <input
          id="amountJpy"
          name="amountJpy"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          className="ot-input"
        />
        {errors.amountJpy && <p className="ot-field-error">{errors.amountJpy}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="stationName">給油所</label>
        <input
          id="stationName"
          name="stationName"
          type="text"
          required
          placeholder="例: ENEOS 仙台○○SS"
          className="ot-input"
        />
        {errors.stationName && <p className="ot-field-error">{errors.stationName}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="note">メモ（任意）</label>
        <input
          id="note"
          name="note"
          type="text"
          maxLength={50}
          className="ot-input"
        />
        {errors.note && <p className="ot-field-error">{errors.note}</p>}
      </div>

      <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block" disabled={pending}>
        {pending ? "登録中…" : "給油を登録"}
      </button>
    </form>
  );
}
