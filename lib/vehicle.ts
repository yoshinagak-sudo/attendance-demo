import type {
  Vehicle,
  DrivingLog,
  RefuelingLog,
  User,
} from "@prisma/client";
import { startOfDateJST, parseYmdJST } from "./time";

export const DRIVING_STATUSES = ["in_progress", "completed"] as const;
export type DrivingStatus = (typeof DRIVING_STATUSES)[number];

export function assertDrivingStatus(value: string): DrivingStatus {
  if ((DRIVING_STATUSES as readonly string[]).includes(value)) return value as DrivingStatus;
  throw new Error(`invalid DrivingStatus: ${value}`);
}

export const DRIVING_STATUS_LABEL: Record<DrivingStatus, string> = {
  in_progress: "進行中",
  completed: "完了",
};

export const VEHICLE_PLATE_MAX_CHARS = 30;
export const VEHICLE_MODEL_MAX_CHARS = 30;
export const VEHICLE_DEPOT_MAX_CHARS = 30;
export const PURPOSE_MAX_CHARS = 50;
export const WORK_SITE_MAX_CHARS = 50;
export const STATION_NAME_MAX_CHARS = 50;
export const REFUELING_NOTE_MAX_CHARS = 50;
export const ODOMETER_MAX = 9_999_999;
export const LITERS_MAX = 500;
export const AMOUNT_JPY_MAX = 500_000;
export const DEFAULT_INSPECTION_WARN_DAYS = 30;

export type ValidationErrors = Record<string, string>;

export function codePointLength(s: string): number {
  return [...s].length;
}

// ===== 車両マスタ =====

export type UpsertVehicleInput = {
  plate: string;
  model: string;
  depot: string;
  inspectionDueDate: string | null;
  vehicleInspectionDueDate: string | null;
};
export type ValidatedUpsertVehicleInput = {
  plate: string;
  model: string;
  depot: string;
  inspectionDueDate: Date | null;
  vehicleInspectionDueDate: Date | null;
};

export function validateUpsertVehicleInput(
  input: UpsertVehicleInput,
): { ok: true; value: ValidatedUpsertVehicleInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  const plate = (input.plate ?? "").trim().normalize("NFKC");
  if (plate.length === 0) errors.plate = "車両番号を入力してください";
  else if (codePointLength(plate) > VEHICLE_PLATE_MAX_CHARS)
    errors.plate = `車両番号は${VEHICLE_PLATE_MAX_CHARS}文字以内です`;

  const model = (input.model ?? "").trim().normalize("NFKC");
  if (model.length === 0) errors.model = "車種を入力してください";
  else if (codePointLength(model) > VEHICLE_MODEL_MAX_CHARS)
    errors.model = `車種は${VEHICLE_MODEL_MAX_CHARS}文字以内です`;

  const depot = (input.depot ?? "").trim().normalize("NFKC");
  if (depot.length === 0) errors.depot = "所属拠点を入力してください";
  else if (codePointLength(depot) > VEHICLE_DEPOT_MAX_CHARS)
    errors.depot = `所属拠点は${VEHICLE_DEPOT_MAX_CHARS}文字以内です`;

  let inspectionDueDate: Date | null = null;
  if (input.inspectionDueDate && input.inspectionDueDate.length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inspectionDueDate)) {
      errors.inspectionDueDate = "点検期限の形式が不正です";
    } else {
      try {
        inspectionDueDate = parseYmdJST(input.inspectionDueDate);
      } catch {
        errors.inspectionDueDate = "点検期限の形式が不正です";
      }
    }
  }

  let vehicleInspectionDueDate: Date | null = null;
  if (input.vehicleInspectionDueDate && input.vehicleInspectionDueDate.length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vehicleInspectionDueDate)) {
      errors.vehicleInspectionDueDate = "車検期限の形式が不正です";
    } else {
      try {
        vehicleInspectionDueDate = parseYmdJST(input.vehicleInspectionDueDate);
      } catch {
        errors.vehicleInspectionDueDate = "車検期限の形式が不正です";
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { plate, model, depot, inspectionDueDate, vehicleInspectionDueDate } };
}

// ===== 走行（出発）=====

export type StartDrivingInput = {
  vehicleId: string;
  startOdometer: string;
  purpose: string;
  workSiteName: string;
  workSiteId: string | null;
};
export type ValidatedStartDrivingInput = {
  vehicleId: string;
  startOdometer: number;
  purpose: string;
  workSiteName: string;
  workSiteId: string | null;
};

export function validateStartDrivingInput(
  input: StartDrivingInput,
): { ok: true; value: ValidatedStartDrivingInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  if (!input.vehicleId || input.vehicleId.trim().length === 0)
    errors.vehicleId = "車両を選択してください";

  const odoStr = (input.startOdometer ?? "").trim();
  const odo = Number(odoStr.replace(/,/g, ""));
  if (!Number.isFinite(odo) || !Number.isInteger(odo) || odo < 0)
    errors.startOdometer = "出発時メーターを整数で入力してください";
  else if (odo > ODOMETER_MAX)
    errors.startOdometer = `メーターは${ODOMETER_MAX.toLocaleString()} km以下です`;

  const purpose = (input.purpose ?? "").trim();
  if (purpose.length === 0) errors.purpose = "目的を入力してください";
  else if (codePointLength(purpose) > PURPOSE_MAX_CHARS)
    errors.purpose = `目的は${PURPOSE_MAX_CHARS}文字以内です`;

  const workSiteName = (input.workSiteName ?? "").trim().normalize("NFKC");
  if (workSiteName.length === 0) errors.workSiteName = "現場名を入力してください";
  else if (codePointLength(workSiteName) > WORK_SITE_MAX_CHARS)
    errors.workSiteName = `現場名は${WORK_SITE_MAX_CHARS}文字以内です`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vehicleId: input.vehicleId.trim(),
      startOdometer: odo,
      purpose,
      workSiteName,
      workSiteId: input.workSiteId?.trim() || null,
    },
  };
}

// ===== 走行（帰着）=====

export type FinishDrivingInput = {
  drivingLogId: string;
  endOdometer: string;
};
export type ValidatedFinishDrivingInput = {
  drivingLogId: string;
  endOdometer: number;
};

export function validateFinishDrivingInput(
  input: FinishDrivingInput,
): { ok: true; value: ValidatedFinishDrivingInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  if (!input.drivingLogId || input.drivingLogId.trim().length === 0)
    errors.drivingLogId = "走行IDが指定されていません";

  const odoStr = (input.endOdometer ?? "").trim();
  const odo = Number(odoStr.replace(/,/g, ""));
  if (!Number.isFinite(odo) || !Number.isInteger(odo) || odo < 0)
    errors.endOdometer = "帰着時メーターを整数で入力してください";
  else if (odo > ODOMETER_MAX)
    errors.endOdometer = `メーターは${ODOMETER_MAX.toLocaleString()} km以下です`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { drivingLogId: input.drivingLogId.trim(), endOdometer: odo } };
}

// ===== 給油 =====

export type CreateRefuelingInput = {
  vehicleId: string;
  refuelDate: string;
  liters: string;
  amountJpy: string;
  stationName: string;
  note: string;
};
export type ValidatedCreateRefuelingInput = {
  vehicleId: string;
  refuelDate: Date;
  liters: number;
  amountJpy: number;
  stationName: string;
  note: string | null;
};

export function validateCreateRefuelingInput(
  input: CreateRefuelingInput,
): { ok: true; value: ValidatedCreateRefuelingInput } | { ok: false; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  if (!input.vehicleId || input.vehicleId.trim().length === 0)
    errors.vehicleId = "車両を選択してください";

  let refuelDate: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.refuelDate ?? "")) {
    errors.refuelDate = "給油日の形式が不正です";
  } else {
    try {
      refuelDate = parseYmdJST(input.refuelDate);
    } catch {
      errors.refuelDate = "給油日の形式が不正です";
    }
  }

  const liters = Number((input.liters ?? "").trim());
  if (!Number.isFinite(liters) || liters <= 0)
    errors.liters = "給油量(L)を入力してください";
  else if (liters > LITERS_MAX)
    errors.liters = `給油量は${LITERS_MAX} L以下です`;

  const amount = Number((input.amountJpy ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0)
    errors.amountJpy = "金額(円)を整数で入力してください";
  else if (amount > AMOUNT_JPY_MAX)
    errors.amountJpy = `金額は${AMOUNT_JPY_MAX.toLocaleString()}円以下です`;

  const stationName = (input.stationName ?? "").trim().normalize("NFKC");
  if (stationName.length === 0) errors.stationName = "給油所を入力してください";
  else if (codePointLength(stationName) > STATION_NAME_MAX_CHARS)
    errors.stationName = `給油所は${STATION_NAME_MAX_CHARS}文字以内です`;

  const note = (input.note ?? "").trim();
  if (codePointLength(note) > REFUELING_NOTE_MAX_CHARS)
    errors.note = `メモは${REFUELING_NOTE_MAX_CHARS}文字以内です`;

  if (Object.keys(errors).length > 0 || !refuelDate) return { ok: false, errors };
  return {
    ok: true,
    value: {
      vehicleId: input.vehicleId.trim(),
      refuelDate,
      liters: Math.round(liters * 10) / 10,
      amountJpy: amount,
      stationName,
      note: note.length === 0 ? null : note,
    },
  };
}

// ===== 集計 =====

export type MonthlyVehicleRow = {
  vehicleId: string;
  plate: string;
  model: string;
  totalDistanceKm: number;
  drivingCount: number;
  totalRefuelLiters: number;
  totalRefuelJpy: number;
  kmPerLiter: number | null;
};

export function buildMonthlyVehicleRows(args: {
  vehicles: Vehicle[];
  drivingLogs: DrivingLog[];
  refuelingLogs: RefuelingLog[];
}): MonthlyVehicleRow[] {
  return args.vehicles
    .map((v) => {
      const ds = args.drivingLogs.filter((d) => d.vehicleId === v.id);
      const rs = args.refuelingLogs.filter((r) => r.vehicleId === v.id);
      const totalDistanceKm = ds.reduce((acc, d) => acc + (d.distanceKm ?? 0), 0);
      const drivingCount = ds.filter((d) => d.status === "completed").length;
      const totalRefuelLiters = Math.round(rs.reduce((acc, r) => acc + r.liters, 0) * 10) / 10;
      const totalRefuelJpy = rs.reduce((acc, r) => acc + r.amountJpy, 0);
      const kmPerLiter =
        totalRefuelLiters > 0 ? Math.round((totalDistanceKm / totalRefuelLiters) * 10) / 10 : null;
      return {
        vehicleId: v.id,
        plate: v.plate,
        model: v.model,
        totalDistanceKm,
        drivingCount,
        totalRefuelLiters,
        totalRefuelJpy,
        kmPerLiter,
      };
    })
    .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
}

export type MonthlyUserDrivingRow = {
  userId: string;
  userName: string;
  totalDistanceKm: number;
  drivingCount: number;
};

export function buildMonthlyUserDrivingRows(args: {
  users: User[];
  drivingLogs: DrivingLog[];
}): MonthlyUserDrivingRow[] {
  return args.users
    .map((u) => {
      const ds = args.drivingLogs.filter((d) => d.userId === u.id);
      return {
        userId: u.id,
        userName: u.name,
        totalDistanceKm: ds.reduce((acc, d) => acc + (d.distanceKm ?? 0), 0),
        drivingCount: ds.filter((d) => d.status === "completed").length,
      };
    })
    .filter((r) => r.drivingCount > 0 || r.totalDistanceKm > 0)
    .sort((a, b) => b.totalDistanceKm - a.totalDistanceKm);
}

export function inspectionsDueWithin(args: {
  vehicles: Vehicle[];
  windowDays?: number;
  now?: Date;
}): { vehicle: Vehicle; daysLeft: number }[] {
  const now = (args.now ?? new Date()).getTime();
  const window = args.windowDays ?? DEFAULT_INSPECTION_WARN_DAYS;
  return args.vehicles
    .filter((v) => v.isActive && v.inspectionDueDate)
    .map((v) => {
      const dueMs = v.inspectionDueDate!.getTime();
      const daysLeft = Math.ceil((dueMs - now) / (24 * 60 * 60 * 1000));
      return { vehicle: v, daysLeft };
    })
    .filter((x) => x.daysLeft <= window && x.daysLeft >= -365)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function vehicleInspectionsDueWithin(args: {
  vehicles: Vehicle[];
  windowDays?: number;
  now?: Date;
}): { vehicle: Vehicle; daysLeft: number }[] {
  const now = (args.now ?? new Date()).getTime();
  const window = args.windowDays ?? DEFAULT_INSPECTION_WARN_DAYS;
  return args.vehicles
    .filter((v) => v.isActive && v.vehicleInspectionDueDate)
    .map((v) => {
      const dueMs = v.vehicleInspectionDueDate!.getTime();
      const daysLeft = Math.ceil((dueMs - now) / (24 * 60 * 60 * 1000));
      return { vehicle: v, daysLeft };
    })
    .filter((x) => x.daysLeft <= window && x.daysLeft >= -365)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export type AlertKind = "inspection" | "vehicleInspection";
export type VehicleAlert = {
  vehicle: Vehicle;
  daysLeft: number;
  kind: AlertKind;
};

export function allVehicleAlertsWithin(args: {
  vehicles: Vehicle[];
  windowDays?: number;
  now?: Date;
}): VehicleAlert[] {
  const insp = inspectionsDueWithin(args).map(
    (x) => ({ ...x, kind: "inspection" as const }),
  );
  const sha = vehicleInspectionsDueWithin(args).map(
    (x) => ({ ...x, kind: "vehicleInspection" as const }),
  );
  return [...insp, ...sha].sort((a, b) => a.daysLeft - b.daysLeft);
}

export const ALERT_LABEL: Record<AlertKind, string> = {
  inspection: "点検",
  vehicleInspection: "車検",
};

export function formatDistanceKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  return `${km.toLocaleString()} km`;
}

export function formatLiters(l: number | null | undefined): string {
  if (l === null || l === undefined) return "—";
  return `${l.toFixed(1)} L`;
}

export function formatJpy(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `¥${amount.toLocaleString()}`;
}

export function todayJST(now?: Date): Date {
  return startOfDateJST(now ?? new Date());
}
