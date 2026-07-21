/**
 * 年次有給休暇の付与・残日数計算ドメイン。
 *
 * SPEC-attendance-request.md §3.1.3, §3.2, §5.1, §7.4 を参照。
 *
 * 残日数 = Σ 有効な付与.days − Σ 有給消化.leaveDays
 * - 有効な付与: grantedOn <= now < expiresOn
 * - 消化: AttendanceRequest.category="paid_leave" かつ status IN {submitted, approved}
 * - FIFO 割当: expiresOn 昇順にソートし、消化を先頭から差し引く（時効ぎり分を優先消化）
 */
import { startOfDateJST } from "./time";

// -----------------------------------------------------------------------------
// 定数：付与日数表（労基法・週所定 5 日以上のフルタイム前提）
// -----------------------------------------------------------------------------

/** 継続勤続 6ヶ月から順に付与される日数。index=0 が最初の付与。 */
export const PAID_LEAVE_GRANT_DAYS: readonly number[] = [
  10, // + 6 ヶ月
  11, // + 1 年 6 ヶ月
  12, // + 2 年 6 ヶ月
  14, // + 3 年 6 ヶ月
  16, // + 4 年 6 ヶ月
  18, // + 5 年 6 ヶ月
  // 以降は 20 日固定
];

/** 6 年目以降の付与日数。 */
export const PAID_LEAVE_MAX_DAYS = 20;

/** 付与間隔（付与 0 の 6 ヶ月を除いた「1 年ごと」を実装ではミリ秒定数にせず月加算で扱う）。 */
export const FIRST_GRANT_MONTHS = 6;

/** 時効: 付与日から 2 年。 */
export const PAID_LEAVE_EXPIRATION_YEARS = 2;

/** grant index (0 origin) に対する付与日数を返す。 */
export function daysForGrantIndex(index: number): number {
  if (index < 0) return 0;
  if (index < PAID_LEAVE_GRANT_DAYS.length) return PAID_LEAVE_GRANT_DAYS[index];
  return PAID_LEAVE_MAX_DAYS;
}

/**
 * hireDate から自動付与すべき grant の予定日（JST 0:00）を、指定 now までに来ているものだけ返す。
 * index 0: hireDate + 6 ヶ月
 * index N (N>=1): hireDate + 6 ヶ月 + N 年
 */
export function scheduledGrantDates(
  hireDate: Date,
  now: Date,
): { index: number; grantedOn: Date; days: number }[] {
  const results: { index: number; grantedOn: Date; days: number }[] = [];
  const base = startOfDateJST(hireDate);
  for (let i = 0; i < 100; i++) {
    const d = addMonthsJST(base, FIRST_GRANT_MONTHS + i * 12);
    if (d.getTime() > now.getTime()) break;
    results.push({ index: i, grantedOn: d, days: daysForGrantIndex(i) });
  }
  return results;
}

/** JST 0:00 の日付に nMonths を加算して、また JST 0:00 の Date を返す。月末繰上げは無し（末日→末日ではなく日数維持）。 */
export function addMonthsJST(base: Date, nMonths: number): Date {
  const jstMs = base.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(jstMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + nMonths;
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(y, m, day));
  return new Date(next.getTime() - 9 * 60 * 60 * 1000);
}

/** grantedOn から expiresOn（+2 年）を計算。 */
export function expirationOf(grantedOn: Date): Date {
  const jstMs = grantedOn.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(jstMs);
  const next = new Date(
    Date.UTC(d.getUTCFullYear() + PAID_LEAVE_EXPIRATION_YEARS, d.getUTCMonth(), d.getUTCDate()),
  );
  return new Date(next.getTime() - 9 * 60 * 60 * 1000);
}

// -----------------------------------------------------------------------------
// 残日数計算（FIFO）
// -----------------------------------------------------------------------------

export type PaidLeaveGrantLite = {
  id: string;
  grantedOn: Date;
  expiresOn: Date;
  days: number;
};

export type PaidLeaveConsumptionLite = {
  id: string;
  workDate: Date;
  leaveDays: number;
  status: "submitted" | "approved";
};

export type PaidLeaveBalance = {
  /** 有効付与合計 - 消化合計。負にはしない。 */
  remaining: number;
  /** 承認済消化の合計。 */
  usedApproved: number;
  /** 申請中消化の合計。 */
  usedPending: number;
  /** 表示用: 最短で失効する grant の残日数と失効日。 */
  nextExpiry: { days: number; expiresOn: Date } | null;
  /** grant ごとの残（有効なもののみ、FIFO 割当後）。 */
  perGrant: {
    id: string;
    grantedOn: Date;
    expiresOn: Date;
    days: number;
    remaining: number;
  }[];
};

/**
 * 付与と消化から残日数を導出する純関数（FIFO 割当）。
 *
 * @param grants 全 grant
 * @param consumptions 全消化（submitted / approved のみ）
 * @param now 判定時刻（デフォルト現在）
 */
export function computePaidLeaveBalance(
  grants: PaidLeaveGrantLite[],
  consumptions: PaidLeaveConsumptionLite[],
  now: Date = new Date(),
): PaidLeaveBalance {
  const active = grants
    .filter((g) => g.grantedOn.getTime() <= now.getTime() && now.getTime() < g.expiresOn.getTime())
    .sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime());

  const perGrant = active.map((g) => ({
    id: g.id,
    grantedOn: g.grantedOn,
    expiresOn: g.expiresOn,
    days: g.days,
    remaining: g.days,
  }));

  let usedApproved = 0;
  let usedPending = 0;
  // FIFO 割当: 消化を workDate 古い順に処理、grant を expiresOn 古い順に消化する
  const sortedCons = [...consumptions].sort(
    (a, b) => a.workDate.getTime() - b.workDate.getTime(),
  );
  for (const c of sortedCons) {
    if (c.status === "approved") usedApproved += c.leaveDays;
    else usedPending += c.leaveDays;
    let need = c.leaveDays;
    for (const g of perGrant) {
      if (need <= 0) break;
      if (g.remaining <= 0) continue;
      // grant の grantedOn <= workDate < expiresOn の grant のみ充当（workDate 時点で有効な grant）
      if (c.workDate.getTime() < g.grantedOn.getTime()) continue;
      if (c.workDate.getTime() >= g.expiresOn.getTime()) continue;
      const take = Math.min(need, g.remaining);
      g.remaining -= take;
      need -= take;
    }
    // need > 0 のまま残ることもある（有給不足の申請）。呼び出し側の残計算では負にしないよう clamp する。
  }

  const remainingSum = perGrant.reduce((a, g) => a + Math.max(0, g.remaining), 0);
  const nextGrant = perGrant.find((g) => g.remaining > 0);

  return {
    remaining: remainingSum,
    usedApproved,
    usedPending,
    nextExpiry: nextGrant
      ? { days: nextGrant.remaining, expiresOn: nextGrant.expiresOn }
      : null,
    perGrant,
  };
}

/**
 * 「この申請を新規に出したら残日数がマイナスにならないか」の判定。
 * すでにキューに乗っている（DB 反映済み）の申請は consumptions に含めて渡す。
 */
export function canConsume(
  balance: PaidLeaveBalance,
  additionalDays: number,
): { ok: boolean; shortBy: number } {
  const shortBy = additionalDays - balance.remaining;
  return { ok: shortBy <= 0, shortBy: Math.max(0, shortBy) };
}
