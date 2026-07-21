import { redirect } from "next/navigation";

/** カテゴリ未指定は申請トップに戻す。 */
export default function AttendanceNewIndex(): never {
  redirect("/attendance");
}
