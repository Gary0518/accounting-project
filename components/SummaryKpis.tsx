import { StatTile } from "@/components/dashboard";
import { ntd, num, pct, type MonthlySummary } from "@/lib/domain";

// 營業數據與金流頁共用的七個 KPI（兩頁上方相同，下面圖表才不同）。
export default function SummaryKpis({
  s,
  periodLabel,
  propLabel,
  year,
  ytd,
}: {
  s: MonthlySummary;
  periodLabel: string;
  propLabel: string;
  year: number;
  ytd: number;
}) {
  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label={`期間損益 · ${propLabel}`}
          value={ntd(s.profit)}
          tone={s.profit < 0 ? "critical" : "good"}
          hero
          sub={periodLabel}
        />
        <StatTile label="加項（收入）" value={ntd(s.addition)} tone="good" />
        <StatTile label="減項（支出）" value={ntd(s.deduction)} tone="critical" />
        <StatTile
          label="住宿率"
          value={pct(s.occupancy)}
          sub={`${num(s.totalRoomNights)} / ${num(s.capacity)} 間夜`}
        />
      </section>
      <section className="grid grid-cols-3 gap-3">
        <StatTile label="總間數" value={`${num(s.totalRoomNights)} 間`} />
        <StatTile label="住宿筆數" value={`${num(s.bookings)} 筆`} />
        <StatTile
          label={`${year} 年度累計`}
          value={ntd(ytd)}
          tone={ytd < 0 ? "critical" : "good"}
        />
      </section>
    </>
  );
}
