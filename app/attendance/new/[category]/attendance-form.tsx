"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createAttendanceRequest,
  createAttendanceResubmission,
  type ActionResult,
} from "@/app/attendance/actions";
import {
  CATEGORY_LABEL,
  CATEGORY_UNIT,
  PAID_LEAVE_KIND_LABEL,
  PAID_LEAVE_KINDS,
  REQUEST_TYPE_LABEL,
  formatLeaveDays,
  type AttendanceCategory,
  type RequestType,
} from "@/lib/attendance-request";
import { formatJSTYmd } from "@/lib/time";

type Props = {
  category: AttendanceCategory;
  userId: string;
  parentId?: string | null;
  defaultScheduledStart: string; // HH:mm
  defaultScheduledEnd: string; // HH:mm
  reasonSuggest: string[];
  paidLeaveRemaining: number | null;
  substituteCandidates: { id: string; workDate: string; siteName: string }[];
};

function todayYmd(): string {
  return formatJSTYmd(new Date());
}

function tomorrowYmd(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return formatJSTYmd(t);
}

/** YYYY-MM-DDTHH:mm:00+09:00 を作る（JST 明示）。UTC 解釈事故を防ぐため。 */
function combine(ymd: string, hhmm: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
  return `${ymd}T${hhmm}:00+09:00`;
}

export function AttendanceForm({
  category,
  userId,
  parentId,
  defaultScheduledStart,
  defaultScheduledEnd,
  reasonSuggest,
  paidLeaveRemaining,
  substituteCandidates,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    parentId ? createAttendanceResubmission : createAttendanceRequest,
    null,
  );

  const unit = CATEGORY_UNIT[category];
  const [requestType, setRequestType] = useState<RequestType>(
    // 日単位系のデフォルトは事前、時間単位系（遅刻等）はデフォルト事後にする
    unit === "day" ? "pre" : "post",
  );
  const defaultDate = requestType === "pre" ? tomorrowYmd() : todayYmd();
  const [workDate, setWorkDate] = useState<string>(defaultDate);
  const [scheduledTime, setScheduledTime] = useState<string>(
    category === "late" ? defaultScheduledStart : defaultScheduledEnd,
  );
  const [actualTime, setActualTime] = useState<string>(
    category === "late" ? defaultScheduledStart : defaultScheduledEnd,
  );
  const [outStart, setOutStart] = useState<string>("10:00");
  const [outEnd, setOutEnd] = useState<string>("11:00");
  const [paidLeaveKind, setPaidLeaveKind] = useState<string>("full");
  const [reason, setReason] = useState<string>("");
  const [substituteForId, setSubstituteForId] = useState<string>(
    substituteCandidates[0]?.id ?? "",
  );
  const [description, setDescription] = useState<string>("");

  const errors = useMemo(() => {
    if (!state || state.ok) return {} as Record<string, string>;
    return state.errors ?? {};
  }, [state]);

  const showFormError = state && !state.ok && state.formError;

  const consumingDays = useMemo(() => {
    if (category !== "paid_leave") return 0;
    return paidLeaveKind === "full" ? 1.0 : 0.5;
  }, [category, paidLeaveKind]);

  return (
    <form action={formAction} className="ot-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="category" value={category} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {parentId && (
        <div className="ot-notice">
          差戻から再申請します（元の申請は履歴に残ります）
        </div>
      )}
      {showFormError && (
        <div className="ot-banner ot-banner-danger" role="alert">
          <span className="ot-banner-icon" aria-hidden="true">
            !
          </span>
          <div className="ot-banner-body">{state?.formError}</div>
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label">申請区分</label>
        <div className="ot-radio-row">
          {(["pre", "post"] as RequestType[]).map((rt) => (
            <label key={rt} className={`ot-radio${requestType === rt ? " is-active" : ""}`}>
              <input
                type="radio"
                name="requestType"
                value={rt}
                checked={requestType === rt}
                onChange={() => {
                  setRequestType(rt);
                  setWorkDate(rt === "pre" ? tomorrowYmd() : todayYmd());
                }}
              />
              {REQUEST_TYPE_LABEL[rt]}
            </label>
          ))}
        </div>
        {errors.requestType && <p className="ot-field-error">{errors.requestType}</p>}
      </div>

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="workDate">
          対象日
        </label>
        <input
          type="date"
          id="workDate"
          name="workDate"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="ot-input"
          required
        />
        {errors.workDate && <p className="ot-field-error">{errors.workDate}</p>}
      </div>

      {/* カテゴリ別入力 */}
      {(category === "late" || category === "early_leave") && (
        <>
          <div className="ot-field">
            <label className="ot-field-label" htmlFor="scheduledHHmm">
              予定{category === "late" ? "出勤" : "退勤"}時刻
            </label>
            <input
              type="time"
              id="scheduledHHmm"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="ot-input"
              required
            />
            <input type="hidden" name="scheduledAt" value={combine(workDate, scheduledTime)} />
            {errors.scheduledAt && <p className="ot-field-error">{errors.scheduledAt}</p>}
          </div>

          <div className="ot-field">
            <label className="ot-field-label" htmlFor="actualHHmm">
              実{category === "late" ? "出勤" : "退勤"}時刻
            </label>
            <input
              type="time"
              id="actualHHmm"
              value={actualTime}
              onChange={(e) => setActualTime(e.target.value)}
              className="ot-input"
              required
            />
            <input type="hidden" name="startAt" value={combine(workDate, actualTime)} />
            {errors.startAt && <p className="ot-field-error">{errors.startAt}</p>}
          </div>
        </>
      )}

      {category === "personal_out" && (
        <>
          <div className="ot-field">
            <label className="ot-field-label" htmlFor="outStart">
              外出開始
            </label>
            <input
              type="time"
              id="outStart"
              value={outStart}
              onChange={(e) => setOutStart(e.target.value)}
              className="ot-input"
              required
            />
            <input type="hidden" name="startAt" value={combine(workDate, outStart)} />
            {errors.startAt && <p className="ot-field-error">{errors.startAt}</p>}
          </div>
          <div className="ot-field">
            <label className="ot-field-label" htmlFor="outEnd">
              外出終了
            </label>
            <input
              type="time"
              id="outEnd"
              value={outEnd}
              onChange={(e) => setOutEnd(e.target.value)}
              className="ot-input"
              required
            />
            <input type="hidden" name="endAt" value={combine(workDate, outEnd)} />
            {errors.endAt && <p className="ot-field-error">{errors.endAt}</p>}
          </div>
        </>
      )}

      {category === "paid_leave" && (
        <>
          <div className="ot-field">
            <label className="ot-field-label">種別</label>
            <div className="ot-radio-row">
              {PAID_LEAVE_KINDS.map((k) => (
                <label
                  key={k}
                  className={`ot-radio${paidLeaveKind === k ? " is-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="paidLeaveKind"
                    value={k}
                    checked={paidLeaveKind === k}
                    onChange={() => setPaidLeaveKind(k)}
                  />
                  {PAID_LEAVE_KIND_LABEL[k]}
                </label>
              ))}
            </div>
            {errors.paidLeaveKind && <p className="ot-field-error">{errors.paidLeaveKind}</p>}
          </div>

          {paidLeaveRemaining != null && (
            <div className="ot-notice">
              残 {formatLeaveDays(paidLeaveRemaining)}（この申請で {formatLeaveDays(consumingDays)}
              消費）
            </div>
          )}
        </>
      )}

      {category === "special_leave" && (
        <div className="ot-field">
          <label className="ot-field-label" htmlFor="reason">
            理由（必須）
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            list="reason-suggest"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 忌引"
            className="ot-input"
            required
          />
          <datalist id="reason-suggest">
            {reasonSuggest.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {errors.reason && <p className="ot-field-error">{errors.reason}</p>}
        </div>
      )}

      {category === "substitute_leave" && (
        <div className="ot-field">
          <label className="ot-field-label" htmlFor="substituteForId">
            元の休日出勤（承認済み・過去90日以内）
          </label>
          {substituteCandidates.length === 0 ? (
            <div className="ot-notice ot-notice-warn">
              該当する休日出勤がありません。先に「休日出勤」を申請・承認してもらってください。
            </div>
          ) : (
            <select
              id="substituteForId"
              name="substituteForId"
              className="ot-input"
              value={substituteForId}
              onChange={(e) => setSubstituteForId(e.target.value)}
              required
            >
              {substituteCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.workDate} / {c.siteName}
                </option>
              ))}
            </select>
          )}
          {errors.substituteForId && <p className="ot-field-error">{errors.substituteForId}</p>}
        </div>
      )}

      <div className="ot-field">
        <label className="ot-field-label" htmlFor="description">
          補足（任意 200 字以内）
        </label>
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={200}
          className="ot-input"
          placeholder="必要に応じて補足を入力"
        />
        {errors.description && <p className="ot-field-error">{errors.description}</p>}
      </div>

      <button
        type="submit"
        className="ot-btn-primary ot-btn-lg ot-btn-block"
        disabled={
          pending ||
          (category === "substitute_leave" && substituteCandidates.length === 0)
        }
      >
        {pending ? "送信中…" : `${CATEGORY_LABEL[category]} 申請を提出する`}
      </button>
    </form>
  );
}
