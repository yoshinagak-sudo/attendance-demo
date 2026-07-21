import { unstable_noStore as noStore } from "next/cache";
import { Inbox, FileClock, FileCheck2, Calendar, ClipboardList } from "lucide-react";
import { requireDashboardSession } from "../_lib/require-dashboard";
import { getPendingCounts } from "../_lib/data";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  noStore();
  await requireDashboardSession();
  const { pendingOvertime, pendingHolidayWork, pendingAttendance, pendingReports } =
    await getPendingCounts();
  const total = pendingOvertime + pendingHolidayWork + pendingAttendance + pendingReports;

  return (
    <>
      <header className="dash-page-head">
        <div className="dash-page-head-main">
          <span className="dash-page-eyebrow">未対応</span>
          <h1 className="dash-page-title">未対応</h1>
          <span className="dash-page-sub">
            統括管理者の確認待ち件数（社員アプリ側で確認・対応します）
          </span>
        </div>
        <div className="dash-page-side">
          <Inbox size={16} aria-hidden="true" />
          合計 {total} 件
        </div>
      </header>

      <section
        className="dash-cards dash-cards-2"
        aria-label="未対応サマリ"
      >
        <article
          className={`dash-card dash-card-lg${
            pendingOvertime > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <FileClock aria-hidden="true" />
            残業申請 未承認
          </div>
          <div className="dash-card-value">
            {pendingOvertime}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">
            現場から提出され、まだ承認・差し戻しされていない残業申請の件数。
            管理者は社員アプリの残業申請メニューから個別に確認できます。
          </div>
        </article>

        <article
          className={`dash-card dash-card-lg${
            pendingHolidayWork > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <Calendar aria-hidden="true" />
            休日出勤 未承認
          </div>
          <div className="dash-card-value">
            {pendingHolidayWork}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">
            事前・事後の休日出勤申請で、承認・差戻がまだのもの。
          </div>
        </article>

        <article
          className={`dash-card dash-card-lg${
            pendingAttendance > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <ClipboardList aria-hidden="true" />
            勤怠申請 未承認
          </div>
          <div className="dash-card-value">
            {pendingAttendance}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">
            欠勤・遅刻・早退・私用外出・有給・特別・振替の合算。
          </div>
        </article>

        <article
          className={`dash-card dash-card-lg${
            pendingReports > 0 ? " dash-card-warn" : ""
          }`}
        >
          <div className="dash-card-head">
            <FileCheck2 aria-hidden="true" />
            日報 未確認
          </div>
          <div className="dash-card-value">
            {pendingReports}
            <span className="dash-card-unit">件</span>
          </div>
          <div className="dash-card-note">
            提出後、まだ管理側で確認されていない日報の件数。
            社員アプリの日報一覧から確認・コメントできます。
          </div>
        </article>
      </section>

      <div className="dash-note">
        この画面は閲覧専用です。承認・確認の操作は社員向け勤怠アプリ（メインドメイン）から行ってください。
      </div>
    </>
  );
}
