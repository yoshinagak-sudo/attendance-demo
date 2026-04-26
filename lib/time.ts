const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function startOfTodayJST(): Date {
  const now = new Date();
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

export function startOfDateJST(date: Date): Date {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

export function startOfMonthJST(year: number, month1to12: number): Date {
  const utc = Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0);
  return new Date(utc - JST_OFFSET_MS);
}

export function endOfMonthJST(year: number, month1to12: number): Date {
  if (month1to12 === 12) return startOfMonthJST(year + 1, 1);
  return startOfMonthJST(year, month1to12 + 1);
}

export function parseHHmm(value: string): { hours: number; minutes: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`invalid HH:mm: ${value}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 47 || minutes < 0 || minutes > 59) {
    throw new Error(`out of range HH:mm: ${value}`);
  }
  return { hours, minutes };
}

export function combineDateAndTimeJST(workDate: Date, hhmm: string): Date {
  const { hours, minutes } = parseHHmm(hhmm);
  const base = startOfDateJST(workDate);
  return new Date(base.getTime() + (hours * 60 + minutes) * 60 * 1000);
}

export function formatJST(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatJSTDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatJSTDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatJSTHHmm(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatJSTYmd(date: Date): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = fmt.find((p) => p.type === "year")?.value ?? "0000";
  const m = fmt.find((p) => p.type === "month")?.value ?? "00";
  const d = fmt.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

export function formatJSTYmdHm(date: Date): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function formatJSTDateWithWeekday(date: Date): string {
  const ymd = formatJSTYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const dow = new Date(utc).getUTCDay();
  return `${y}年${m}月${d}日（${WEEKDAY_JA[dow]}）`;
}

export function parseYmdJST(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error(`invalid YYYY-MM-DD: ${ymd}`);
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return new Date(utc - JST_OFFSET_MS);
}
