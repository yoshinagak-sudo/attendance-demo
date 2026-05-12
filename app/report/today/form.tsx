"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { upsertReport, submitReport, withdrawReport, type ActionResult } from "@/app/report/actions";
import {
  ITEMS_MAX_COUNT,
  ITEM_DESCRIPTION_MAX_CHARS,
  PROGRESS_NOTE_MAX_CHARS,
} from "@/lib/daily-report";

export type ItemDraft = {
  key: string;
  orderIndex: number;
  startTime: string;
  endTime: string;
  description: string;
  workSiteName: string;
  workSiteId: string | null;
};

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 0;
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  return minutes > 0 ? minutes : 0;
}

function formatMinHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function TodayReportForm({
  reportDate,
  initialItems,
  initialProgressNote,
  status,
  sites,
}: {
  reportDate: string;
  initialItems: ItemDraft[];
  initialProgressNote: string;
  status: "draft" | "submitted" | "acknowledged";
  sites: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<ItemDraft[]>(
    initialItems.length > 0
      ? initialItems
      : [
          {
            key: "new-0",
            orderIndex: 0,
            startTime: "",
            endTime: "",
            description: "",
            workSiteName: "",
            workSiteId: null,
          },
        ],
  );
  const [progressNote, setProgressNote] = useState(initialProgressNote);
  const [autosaveLabel, setAutosaveLabel] = useState<string>("");
  const [pendingAuto, startAutoTransition] = useTransition();
  const [pendingSubmit, startSubmitTransition] = useTransition();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadonly = status === "acknowledged";

  useEffect(() => {
    if (isReadonly) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const fd = new FormData();
      fd.append("reportDate", reportDate);
      fd.append("progressNote", progressNote);
      fd.append("payload", JSON.stringify(buildPayload(items)));
      startAutoTransition(async () => {
        const result = (await upsertReport(null, fd)) as ActionResult;
        if (result?.ok) {
          const t = new Date();
          setAutosaveLabel(
            `保存しました ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
          );
        } else {
          setAutosaveLabel("保存に失敗");
        }
      });
    }, 5000);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, progressNote, reportDate, isReadonly]);

  function buildPayload(its: ItemDraft[]) {
    return its.map((it, idx) => ({
      orderIndex: idx,
      startTime: it.startTime,
      endTime: it.endTime,
      description: it.description,
      workSiteName: it.workSiteName,
      workSiteId: it.workSiteId,
    }));
  }

  function addItem() {
    if (items.length >= ITEMS_MAX_COUNT) return;
    const lastEnd = items.at(-1)?.endTime ?? "";
    setItems([
      ...items,
      {
        key: `new-${Date.now()}`,
        orderIndex: items.length,
        startTime: lastEnd,
        endTime: "",
        description: "",
        workSiteName: "",
        workSiteId: null,
      },
    ]);
  }

  function removeItem(key: string) {
    setItems(items.filter((it) => it.key !== key));
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  const totalMinutes = items.reduce(
    (sum, it) => sum + diffMinutes(it.startTime, it.endTime),
    0,
  );

  async function handleSubmit(formData: FormData) {
    formData.append("payload", JSON.stringify(buildPayload(items)));
    formData.append("progressNote", progressNote);
    formData.append("reportDate", reportDate);
    startSubmitTransition(async () => {
      await submitReport(formData);
    });
  }

  async function handleWithdraw() {
    const fd = new FormData();
    const id = (document.getElementById("report-id") as HTMLInputElement | null)?.value ?? "";
    fd.append("id", id);
    startSubmitTransition(async () => {
      await withdrawReport(fd);
    });
  }

  return (
    <div className="dr-form">
      <div className="dr-form-head">
        <div>
          <span className="dr-form-total-label">合計工数</span>
          <span className="num dr-form-total">{formatMinHm(totalMinutes)}</span>
        </div>
        {autosaveLabel && (
          <span className="dr-autosave-status">
            {pendingAuto ? "保存中…" : autosaveLabel}
          </span>
        )}
      </div>

      <section className="dr-items-section">
        <div className="dr-section-head">
          <h2 className="ot-section-title">作業アイテム</h2>
          <span className="section-sub tabular">{items.length} / {ITEMS_MAX_COUNT}</span>
        </div>

        <ul className="dr-item-list">
          {items.map((it, idx) => {
            const dur = diffMinutes(it.startTime, it.endTime);
            return (
              <li key={it.key} className="dr-item-card">
                <div className="dr-item-head">
                  <span className="dr-item-num">#{idx + 1}</span>
                  <span className="num dr-item-duration">{dur > 0 ? formatMinHm(dur) : "0:00"}</span>
                  {!isReadonly && items.length > 1 && (
                    <button type="button" className="link dr-item-remove" onClick={() => removeItem(it.key)}>
                      削除
                    </button>
                  )}
                </div>
                <div className="dr-item-row">
                  <label className="dr-item-label">開始</label>
                  <input
                    type="time"
                    className="ot-input dr-time-input"
                    value={it.startTime}
                    onChange={(e) => updateItem(it.key, { startTime: e.target.value })}
                    disabled={isReadonly}
                  />
                  <label className="dr-item-label">終了</label>
                  <input
                    type="time"
                    className="ot-input dr-time-input"
                    value={it.endTime}
                    onChange={(e) => updateItem(it.key, { endTime: e.target.value })}
                    disabled={isReadonly}
                  />
                </div>
                <div className="dr-item-row">
                  <input
                    type="text"
                    className="ot-input"
                    placeholder="現場名"
                    list="site-suggestions"
                    value={it.workSiteName}
                    onChange={(e) => updateItem(it.key, { workSiteName: e.target.value })}
                    disabled={isReadonly}
                  />
                </div>
                <div className="dr-item-row">
                  <textarea
                    className="ot-input dr-item-desc"
                    rows={2}
                    maxLength={ITEM_DESCRIPTION_MAX_CHARS}
                    placeholder="作業内容（例: エアコン据付、配管接続）"
                    value={it.description}
                    onChange={(e) => updateItem(it.key, { description: e.target.value })}
                    disabled={isReadonly}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <datalist id="site-suggestions">
          {sites.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>

        {!isReadonly && (
          <button
            type="button"
            className="ot-btn-ghost ot-btn-block dr-add-item"
            onClick={addItem}
            disabled={items.length >= ITEMS_MAX_COUNT}
          >
            + 作業を追加
          </button>
        )}
      </section>

      <section className="dr-progress-section">
        <h2 className="ot-section-title">進捗・トラブル・申し送り</h2>
        <textarea
          className="ot-input"
          rows={6}
          maxLength={PROGRESS_NOTE_MAX_CHARS}
          value={progressNote}
          onChange={(e) => setProgressNote(e.target.value)}
          placeholder="本日の進捗、トラブル、明日への申し送りを記載"
          disabled={isReadonly}
        />
        <div className="dr-charcount">
          {[...progressNote].length} / {PROGRESS_NOTE_MAX_CHARS}
        </div>
      </section>

      {!isReadonly && status !== "submitted" && (
        <form action={handleSubmit}>
          <button type="submit" className="ot-btn-primary ot-btn-lg ot-btn-block" disabled={pendingSubmit}>
            {pendingSubmit ? "提出中…" : "日報を提出する"}
          </button>
        </form>
      )}

      {status === "submitted" && (
        <div className="dr-submitted-cta">
          <div className="ot-banner ot-banner-success">
            <span className="ot-banner-icon" aria-hidden="true">✓</span>
            <div className="ot-banner-body">提出済の日報です。manager の確認待ち。</div>
          </div>
          <button
            type="button"
            className="ot-btn-ghost ot-btn-block"
            onClick={handleWithdraw}
            disabled={pendingSubmit}
          >
            取り下げて編集に戻す
          </button>
        </div>
      )}

      {isReadonly && (
        <div className="ot-banner ot-banner-success">
          <span className="ot-banner-icon" aria-hidden="true">✓</span>
          <div className="ot-banner-body">確認済の日報です。編集できません。</div>
        </div>
      )}
    </div>
  );
}
