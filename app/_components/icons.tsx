"use client";

/**
 * アプリ全体で使う lucide-react アイコンの集約レイヤー。
 *
 * 方針:
 * - 同じ意味には常に同じアイコンを使う（業務系UIでは「車両=Truck」「日報=ClipboardList」のように固定）
 * - サイズ/色は呼び出し側のCSS（width/height/color）で制御。ここでは渡さない
 * - インポートはここ経由で集約することで、将来差し替えを1箇所で完結させる
 */
export {
  Home as HomeIcon,
  Clock4 as OvertimeIcon,
  Truck as VehicleIcon,
  ClipboardList as ReportIcon,
  LayoutDashboard as AdminIcon,
} from "lucide-react";
