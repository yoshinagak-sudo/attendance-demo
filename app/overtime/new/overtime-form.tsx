"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  DESCRIPTION_MAX_CHARS,
  WORK_SITE_MAX_CHARS,
  codePointLength,
  formatDurationJa,
  REQUEST_TYPE_LABEL,
} from "@/lib/overtime";
import {
  combineDateAndTimeJST,
  parseYmdJST,
  formatJSTDateWithWeekday,
} from "@/lib/time";
import { createOvertimeRequest, type ActionResult } from "../actions";

type WorkSiteOption = { id: string; name: string };

type Props = {
  userId: string;
  userName: string;
  defaultWorkDate: string; // YYYY-MM-DD
  defaultStartTime: string; // HH:mm
  defaultEndTime: string; // HH:mm
  warnings: string[];
  regularEndTime: string;
  workSites: WorkSiteOption[];
  // 再申請用
  parentId?: string;
  defaultRequestType?: "pre" | "post";
  defaultWorkSiteName?: string;
  defaultDescription?: string;
  /** 「再申請する」など、submit ボタンの文言 */
  submitLabel?: string;
  /** Server Action を差し替える（再申請時に createResubmission を渡す） */
  action?: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  /** 親申請からの workDate プリフィル（YYYY-MM-DD） */
  fixedDefaultWorkDate?: string;
};

const WARNING_LABEL: Record<string, string> = {
  no_clock_out:
    "本日の退勤打刻が見つかりません。所定終業時刻を初期値にしました",
  multiple_clock_outs:
    "退勤打刻が複数あります。最後の退勤を採用しました",
  over_12h: "残業時間が12時間を超えています。内容を再確認してください",
  end_before_start_fallback:
    "終了が開始より前のため、開始の1時間後を初期値にしました",
};

function isHHmm(v: string): boolean {
  return /^\d{2}:\d{2}$/.test(v);
}

export function OvertimeForm({
  userId,
  userName,
  defaultWorkDate,
  defaultStartTime,
  defaultEndTime,
  warnings,
  regularEndTime,
  workSites,
  parentId,
  defaultRequestType,
  defaultWorkSiteName,
  defaultDescription,
  submitLabel = "申請を送信する",
  action = createOvertimeRequest,
  fixedDefaultWorkDate,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [requestType, setRequestType] = useState<"pre" | "post">(
    defaultRequestType ?? "pre",
  );
  const [workDate, setWorkDate] = useState(fixedDefaultWorkDate ?? defaultWorkDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [workSiteName, setWorkSiteName] = useState(defaultWorkSiteName ?? "");
  const [workSiteId, setWorkSiteId] = useState<string>("");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  // 計算: durationMinutes / ISO startAt, endAt
  const computed = useMemo(() => {
    if (!workDate || !isHHmm(startTime) || !isHHmm(endTime)) {
      return { durationMinutes: 0, startIso: "", endIso: "", invalid: true };
    }
    try {
      const baseDate = parseYmdJST(workDate);
      const start = combineDateAndTimeJST(baseDate, startTime);
      const end = combineDateAndTimeJST(baseDate, endTime);
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);
      return {
        durationMinutes: diff,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        invalid: diff <= 0,
      };
    } catch {
      return { durationMinutes: 0, startIso: "", endIso: "", invalid: true };
    }
  }, [workDate, startTime, endTime]);

  const descLen = codePointLength(description);
  const siteLen = codePointLength(workSiteName);
  const descClass =
    descLen > DESCRIPTION_MAX_CHARS
      ? "ot-charcount is-error"
      : descLen >= 180
        ? "ot-charcount is-warn"
        : "ot-charcount";

  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!workDate) errors.workDate = "申請日を入力してください";
    if (!isHHmm(startTime)) errors.startAt = "開始時刻を入力してください";
    if (!isHHmm(endTime)) errors.endAt = "終了時刻を入力してください";
    if (computed.durationMinutes <= 0 && !errors.startAt && !errors.endAt) {
      errors.endAt = "終了時刻は開始時刻より後にしてください";
    }
    if (workSiteName.trim().length === 0) {
      errors.workSiteName = "現場名を入力してください";
    } else if (siteLen > WORK_SITE_MAX_CHARS) {
      errors.workSiteName = `現場名は${WORK_SITE_MAX_CHARS}文字以内です`;
    }
    if (description.trim().length === 0) {
      errors.description = "作業内容を入力してください";
    } else if (descLen > DESCRIPTION_MAX_CHARS) {
      errors.description = `作業内容は${DESCRIPTION_MAX_CHARS}文字以内です`;
    }
    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  // datalist で workSiteId を更新
  const handleSiteChange = (value: string) => {
    setWorkSiteName(value);
    const matched = workSites.find((w) => w.name === value);
    setWorkSiteId(matched?.id ?? "");
  };

  // サーバーエラー
  const serverErrors =
    state && !state.ok ? state.errors : ({} as Record<string, string>);
  const formError = state && !state.ok ? state.formError : undefined;

  const fieldError = (key: string): string | undefined =>
    clientErrors[key] || serverErrors[key];

  const reqTypeLabel = REQUEST_TYPE_LABEL[requestType];

  // 確認画面の日付表示
  const workDateLabel = useMemo(() => {
    try {
      return formatJSTDateWithWeekday(parseYmdJST(workDate));
    } catch {
      return workDate;
    }
  }, [workDate]);

  return (
    <>
      <Stepper current={step} />

      {/* 共通: サーバーエラー帯 */}
      {formError && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">{formError}</div>
        </div>
      )}

      {/* 退勤打刻ベースの警告（ステップ1で表示） */}
      {step === 1 && warnings.length > 0 && (
        <div
          className="ot-banner ot-banner-warn"
          role="status"
          aria-live="polite"
        >
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <ul className="ot-banner-list ot-banner-body">
            {warnings.map((w, i) => (
              <li key={`${w}-${i}`}>{WARNING_LABEL[w] ?? w}</li>
            ))}
          </ul>
        </div>
      )}

      {step === 1 && (
        <div className="ot-form-card">
          <h2 className="ot-section-title">申請種別</h2>
          <div
            className="ot-segment"
            role="radiogroup"
            aria-label="申請種別"
          >
            <button
              type="button"
              role="radio"
              aria-checked={requestType === "pre"}
              className={
                requestType === "pre"
                  ? "ot-segment-btn is-active"
                  : "ot-segment-btn"
              }
              onClick={() => setRequestType("pre")}
            >
              <span className="ot-segment-btn-label">事前申請</span>
              <span className="ot-segment-btn-sub">残業開始前に申請</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={requestType === "post"}
              className={
                requestType === "post"
                  ? "ot-segment-btn is-active"
                  : "ot-segment-btn"
              }
              onClick={() => setRequestType("post")}
            >
              <span className="ot-segment-btn-label">事後申請</span>
              <span className="ot-segment-btn-sub">当日中に実績入力</span>
            </button>
          </div>
          {fieldError("requestType") && (
            <p className="ot-field-error" role="alert">
              {fieldError("requestType")}
            </p>
          )}

          <h2 className="ot-section-title">日時</h2>
          <div className="ot-field">
            <label htmlFor="ot-workDate" className="ot-field-label">
              申請日<span className="ot-field-required">*</span>
            </label>
            <input
              id="ot-workDate"
              type="date"
              className="ot-input"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              aria-invalid={!!fieldError("workDate")}
              required
              style={{ maxWidth: 200 }}
            />
            {fieldError("workDate") && (
              <p className="ot-field-error" role="alert">
                {fieldError("workDate")}
              </p>
            )}
          </div>

          <div className="ot-field">
            <label className="ot-field-label">
              残業時間<span className="ot-field-required">*</span>
            </label>
            <div className="ot-time-row">
              <input
                type="time"
                className="ot-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="開始時刻"
                aria-invalid={!!fieldError("startAt")}
                required
              />
              <span className="ot-time-divider" aria-hidden="true">
                〜
              </span>
              <input
                type="time"
                className="ot-input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                aria-label="終了時刻"
                aria-invalid={!!fieldError("endAt")}
                required
              />
            </div>
            <div
              className={
                computed.invalid
                  ? "ot-calc-badge is-error"
                  : "ot-calc-badge"
              }
              aria-live="polite"
            >
              <span aria-hidden="true">⏱</span>
              {computed.invalid
                ? "終了時刻を開始時刻より後にしてください"
                : `合計 ${formatDurationJa(computed.durationMinutes)}（自動計算）`}
            </div>
            {fieldError("startAt") && (
              <p className="ot-field-error" role="alert">
                {fieldError("startAt")}
              </p>
            )}
            {fieldError("endAt") && (
              <p className="ot-field-error" role="alert">
                {fieldError("endAt")}
              </p>
            )}
            <p className="ot-field-help">
              所定終業時刻 {regularEndTime} を起点に自動入力されています
            </p>
          </div>

          <h2 className="ot-section-title">残業内容</h2>
          <div className="ot-field">
            <label htmlFor="ot-workSiteName" className="ot-field-label">
              現場名<span className="ot-field-required">*</span>
            </label>
            <input
              id="ot-workSiteName"
              type="text"
              className="ot-input"
              value={workSiteName}
              onChange={(e) => handleSiteChange(e.target.value)}
              maxLength={WORK_SITE_MAX_CHARS * 2}
              list="ot-worksites"
              placeholder="例: 第3工場ライン、〇〇プロジェクト"
              aria-invalid={!!fieldError("workSiteName")}
              required
            />
            <datalist id="ot-worksites">
              {workSites.map((w) => (
                <option key={w.id} value={w.name} />
              ))}
            </datalist>
            {fieldError("workSiteName") && (
              <p className="ot-field-error" role="alert">
                {fieldError("workSiteName")}
              </p>
            )}
            {workSites.length > 0 && (
              <p className="ot-field-help">
                履歴: {workSites.slice(0, 5).map((w) => w.name).join(" / ")}
                {workSites.length > 5 && " など"}
              </p>
            )}
          </div>

          <div className="ot-field">
            <label htmlFor="ot-description" className="ot-field-label">
              作業内容<span className="ot-field-required">*</span>
            </label>
            <textarea
              id="ot-description"
              className="ot-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="具体的な作業内容を記載してください（例: 設備トラブル対応、月次締め処理）"
              aria-invalid={!!fieldError("description")}
              rows={4}
              required
            />
            <div className={descClass} aria-live="polite">
              {descLen} / {DESCRIPTION_MAX_CHARS} 文字
            </div>
            {fieldError("description") && (
              <p className="ot-field-error" role="alert">
                {fieldError("description")}
              </p>
            )}
          </div>

          <div className="ot-btn-row">
            <Link
              href={`/overtime?actor=${encodeURIComponent(userId)}`}
              className="ot-btn-ghost"
            >
              キャンセル
            </Link>
            <span className="ot-btn-row-end">
              <button
                type="button"
                className="ot-btn-primary ot-btn-lg"
                onClick={handleNext}
                disabled={descLen > DESCRIPTION_MAX_CHARS}
              >
                確認画面へ →
              </button>
            </span>
          </div>
        </div>
      )}

      {step === 2 && (
        <form action={formAction} className="ot-form-card">
          {/* hidden fields */}
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="workDate" value={workDate} />
          <input type="hidden" name="startAt" value={computed.startIso} />
          <input type="hidden" name="endAt" value={computed.endIso} />
          <input type="hidden" name="workSiteName" value={workSiteName} />
          <input type="hidden" name="workSiteId" value={workSiteId} />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="requestType" value={requestType} />
          {parentId && <input type="hidden" name="parentId" value={parentId} />}

          <h2 className="ot-section-title">入力内容を確認してください</h2>

          <div className="ot-detail-card" style={{ marginBottom: 16 }}>
            <table className="ot-detail-table">
              <tbody>
                <tr>
                  <th scope="row">申請者</th>
                  <td>{userName}</td>
                </tr>
                <tr>
                  <th scope="row">申請種別</th>
                  <td>
                    <span
                      className={
                        requestType === "pre"
                          ? "badge ot-badge-pre"
                          : "badge ot-badge-post"
                      }
                    >
                      {reqTypeLabel}申請
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">申請日</th>
                  <td className="num">{workDateLabel}</td>
                </tr>
                <tr>
                  <th scope="row">残業時間</th>
                  <td>
                    <span className="num">
                      {startTime} 〜 {endTime}
                    </span>
                    <span className="ot-detail-duration">
                      （{formatDurationJa(computed.durationMinutes)}）
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">現場名</th>
                  <td>{workSiteName}</td>
                </tr>
                <tr>
                  <th scope="row">作業内容</th>
                  <td>{description}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="ot-banner ot-banner-info">
            <span className="ot-banner-icon" aria-hidden="true">
              i
            </span>
            <div className="ot-banner-body">
              送信後は管理者の承認待ちとなります。差戻された場合は再申請できます。
            </div>
          </div>

          {/* 確認画面でのサーバーエラー（フィールド単位） */}
          {Object.keys(serverErrors).length > 0 && (
            <div className="ot-banner ot-banner-danger" role="alert">
              <span className="ot-banner-icon" aria-hidden="true">
                !
              </span>
              <ul className="ot-banner-list ot-banner-body">
                {Object.entries(serverErrors).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="ot-btn-row">
            <button
              type="button"
              className="ot-btn-secondary"
              onClick={() => setStep(1)}
              disabled={pending}
            >
              ← 修正する
            </button>
            <span className="ot-btn-row-end">
              <button
                type="submit"
                className="ot-btn-primary ot-btn-lg"
                disabled={pending || computed.invalid}
              >
                {pending ? (
                  <span className="ot-submitting">
                    <span className="ot-spinner" aria-hidden="true" />
                    送信中…
                  </span>
                ) : (
                  submitLabel
                )}
              </button>
            </span>
          </div>
        </form>
      )}
    </>
  );
}

function Stepper({ current }: { current: 1 | 2 }) {
  return (
    <nav className="ot-stepper" aria-label="申請フロー">
      <span
        className={
          current === 1
            ? "ot-stepper-item is-current"
            : "ot-stepper-item is-done"
        }
      >
        <span className="ot-stepper-num" aria-hidden="true">
          {current === 1 ? "1" : "✓"}
        </span>
        入力
      </span>
      <span
        className={
          current === 2 ? "ot-stepper-line is-done" : "ot-stepper-line"
        }
        aria-hidden="true"
      />
      <span
        className={
          current === 2 ? "ot-stepper-item is-current" : "ot-stepper-item"
        }
      >
        <span className="ot-stepper-num" aria-hidden="true">
          2
        </span>
        確認
      </span>
    </nav>
  );
}
