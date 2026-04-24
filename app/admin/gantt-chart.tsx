import type { Session } from "@/lib/attendance";

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR;

function toHourFrac(date: Date): number {
  const jstOffset = 9 * 60;
  const local = new Date(date.getTime() + jstOffset * 60000);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

function formatHM(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function GanttChart({
  sessions,
  userOrder,
  now,
}: {
  sessions: Session[];
  userOrder: { id: string; name: string }[];
  now: Date;
}) {
  const nowFrac = Math.min(Math.max(toHourFrac(now) - START_HOUR, 0), HOURS);
  const nowLabel = formatHM(now);

  const byUser = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s);
  }

  return (
    <div className="gantt-wrap">
      <div className="gantt-toolbar">
        <div className="gantt-legend" aria-label="凡例">
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch gantt-legend-swatch-active" />
            出勤中
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch gantt-legend-swatch-done" />
            退勤済
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch gantt-legend-swatch-long" />
            長時間（10h〜）
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-now-dot" />
            現在時刻
          </span>
        </div>
        <div className="tabular">
          {START_HOUR}:00 – {END_HOUR}:00
        </div>
      </div>

      <div className="gantt-scroll">
        <div className="gantt">
          <div className="gantt-axis">
            {Array.from({ length: HOURS + 1 }, (_, i) => START_HOUR + i).map((h) => {
              const isMajor = (h - START_HOUR) % 4 === 0;
              return (
                <div
                  key={h}
                  className={isMajor ? "gantt-tick" : "gantt-tick gantt-tick-minor"}
                  style={{ left: `${((h - START_HOUR) / HOURS) * 100}%` }}
                >
                  <span>{h}:00</span>
                </div>
              );
            })}
            {/* NOW ラベルは axis 行内に絶対配置（行数に依存しないので堅牢） */}
            <div
              className="gantt-axis-now"
              style={{ left: `${(nowFrac / HOURS) * 100}%` }}
              aria-label={`現在時刻 ${nowLabel}`}
            >
              <span className="gantt-now-label">NOW {nowLabel}</span>
            </div>
          </div>

          <div className="gantt-rows">
            {userOrder.map((u) => {
              const userSessions = byUser.get(u.id) ?? [];
              return (
                <div key={u.id} className="gantt-row">
                  <div className="gantt-label" title={u.name}>
                    {u.name}
                  </div>
                  <div className="gantt-track" role="presentation">
                    <div
                      className="gantt-now"
                      style={{ left: `${(nowFrac / HOURS) * 100}%` }}
                      aria-hidden="true"
                    >
                      {/* 各行の先頭行にだけ Now ラベル出すと邪魔なので、現在線そのものに付ける */}
                    </div>
                    {userSessions.map((s, idx) => {
                      const startFrac = Math.max(
                        toHourFrac(s.startAt) - START_HOUR,
                        0,
                      );
                      const endFrac = s.endAt
                        ? Math.min(toHourFrac(s.endAt) - START_HOUR, HOURS)
                        : nowFrac;
                      const left = (startFrac / HOURS) * 100;
                      const width = Math.max(
                        ((endFrac - startFrac) / HOURS) * 100,
                        0.6,
                      );
                      const isActive = s.endAt === null;
                      const isLong = s.durationMinutes / 60 >= 10;
                      const cls = isLong
                        ? "gantt-bar gantt-bar-long"
                        : isActive
                          ? "gantt-bar gantt-bar-active"
                          : "gantt-bar gantt-bar-done";
                      const hours = (s.durationMinutes / 60).toFixed(1);
                      const startStr = formatHM(s.startAt);
                      const endStr = s.endAt ? formatHM(s.endAt) : "出勤中";
                      const tooltip = `${u.name} / ${startStr}〜${endStr} (${hours}h)${
                        isLong ? " ⚠ 長時間" : ""
                      }`;
                      return (
                        <div
                          key={idx}
                          className={cls}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={tooltip}
                          aria-label={tooltip}
                        >
                          <span className="gantt-bar-text">{hours}h</span>
                        </div>
                      );
                    })}
                    {userSessions.length === 0 && (
                      <div className="gantt-empty-row">未出勤</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
