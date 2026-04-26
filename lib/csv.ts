const BOM = "﻿";
const CRLF = "\r\n";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeCsv(rows: (string | number | null | undefined)[][]): string {
  const lines = rows.map((row) => row.map(escapeCell).join(","));
  return BOM + lines.join(CRLF) + CRLF;
}

export function csvResponseHeaders(filename: string): HeadersInit {
  const encoded = encodeURIComponent(filename);
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "no-store",
  };
}
