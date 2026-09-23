import { StatTile } from "@/components/dashboard";
import {
  ntd,
  num,
  pct,
  CLEANING_FEE_PER_ROOM,
  type MonthlySummary,
} from "@/lib/domain";

// 營業數據與金流頁共用的 KPI（兩頁上方相同，下面圖表才不同）。
export default function SummaryKpis({
  s,
  periodLabel,
  propLabel,
}: {
  s: MonthlySummary;
  periodLabel: string;
  propLabel: string;
}) {
  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile
          label={`期間損益 · ${propLabel}`}
          value={ntd(s.profit)}
          tone={s.profit < 0 ? "critical" : "good"}
          hero
          sub={periodLabel}
        />
        <StatTile label="加項（收入）" value={ntd(s.addition)} tone="good" />
        <StatTile label="減項（支出）" value={ntd(s.deduction)} tone="critical" />
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label="住宿率"
          value={pct(s.occupancy)}
          sub={`${num(s.totalRoomNights)} / ${num(s.capacity)} 間夜`}
        />
        <StatTile label="住宿筆數" value={`${num(s.bookings)} 筆`} />
        <StatTile label="總間數" value={`${num(s.totalRoomNights)} 間`} />
        {/* 清潔費是每月底排程才產生的，所以當月看到 0 是正常的 */}
        <StatTile
          label="清潔房間數"
          value={`${num(s.cleaningRooms)} 間`}
          sub={`清潔費 ÷ ${CLEANING_FEE_PER_ROOM}`}
        />
      </section>
    </>
  );
}
