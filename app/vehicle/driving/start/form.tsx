"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { startDriving, type ActionResult } from "@/app/vehicle/actions";
import { OdometerCamera } from "@/app/vehicle/_components/OdometerCamera";

const initial: ActionResult | null = null;

type VehicleOption = {
  id: string;
  plate: string;
  model: string;
  lastOdometer: number | null;
};

export function StartDrivingForm({
  vehicles,
  preselectedVehicleId,
  sites,
}: {
  vehicles: VehicleOption[];
  preselectedVehicleId: string | null;
  sites: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(startDriving, initial);
  const errors = state && !state.ok ? state.errors : {};
  const formError = state && !state.ok ? state.formError : null;
  const odoInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string>(
    preselectedVehicleId ?? "",
  );
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  // 車両切替時に前回帰着メーターをデフォルトに
  useEffect(() => {
    if (!odoInputRef.current) return;
    if (selected?.lastOdometer != null) {
      odoInputRef.current.value = String(selected.lastOdometer);
    } else {
      odoInputRef.current.value = "";
    }
  }, [selectedId, selected?.lastOdometer]);

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
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
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
        <label className="ot-field-label" htmlFor="startOdometer">
          出発時メーター（km）
        </label>
        <input
          ref={odoInputRef}
          id="startOdometer"
          name="startOdometer"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          defaultValue={selected?.lastOdometer ?? undefined}
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
        {errors.startOdometer && <p className="ot-field-error">{errors.startOdometer}</p>}
        {selected?.lastOdometer != null && (
          <p className="ot-field-help">
            前回帰着時: <strong className="num">{selected.lastOdometer.toLocaleString()}</strong> km
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
