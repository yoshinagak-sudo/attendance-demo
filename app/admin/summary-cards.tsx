import type { DailyStats } from "@/lib/attendance";

type CardConfig = {
  label: string;
  value: string;
  unit: string;
  foot?: string;
  footWarn?: boolean;
};

export function SummaryCards({ stats }: { stats: DailyStats }) {
  const hours = (stats.totalMinutes / 60).toFixed(1);
  const totalStaff = stats.workingNow + stats.clockedOut + stats.notYetIn;

  const cards: CardConfig[] = [
    {
      label: "出勤中",
      value: String(stats.workingNow),
      unit: "名",
      foot: `全${totalStaff}名中`,
    },
    {
      label: "退勤済",
      value: String(stats.clockedOut),
      unit: "名",
      foot:
        totalStaff > 0
          ? `完了率 ${Math.round((stats.clockedOut / totalStaff) * 100)}%`
          : undefined,
    },
    {
      label: "未出勤",
      value: String(stats.notYetIn),
      unit: "名",
      foot: stats.notYetIn > 0 ? "要確認" : "該当なし",
      footWarn: stats.notYetIn > 0,
    },
    {
      label: "合計労働時間",
      value: hours,
      unit: "h",
      foot: stats.workingNow > 0 ? "本日途中集計" : "確定値",
    },
  ];

  return (
    <div className="cards">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <div className="card-head">
            <span className="card-label">{c.label}</span>
          </div>
          <div className="card-value">
            {c.value}
            <span className="card-unit">{c.unit}</span>
          </div>
          {c.foot && (
            <div
              className={
                c.footWarn ? "card-foot card-foot-warn" : "card-foot"
              }
            >
              {c.foot}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
