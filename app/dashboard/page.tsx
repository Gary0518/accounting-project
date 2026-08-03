import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import FilterBar from "@/components/FilterBar";
import SummaryKpis from "@/components/SummaryKpis";
import { BarList, RoomTypeTable, MonthlyPnl } from "@/components/dashboard";
import EntryTable from "@/components/EntryTable";
import PrintButton from "@/components/PrintButton";
import { loadDashboardData } from "@/lib/queries";
import { getAccess, allowedPropertyIds, canAny } from "@/lib/access";
import { summarize, monthlyNetSeries, resolvePeriod, currentMonth } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; property?: string; period?: string; year?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/login");
  if (!canAny(access, "operations")) {
    return (
      <>
        <NavBar active="dashboard" />
        <NoAccess what="營業數據" />
      </>
    );
  }

  const { month: monthParam, property: propParam, period: periodParam, year: yearParam } =
    await searchParams;
  const month = monthParam ?? currentMonth();
  const property = propParam ?? "all";
  const period = resolvePeriod(periodParam ?? "month", month, yearParam);

  // 給滾輪篩選列用
  const mode = period.key === "year" ? "year" : "month";
  const monthNum = mode === "year" ? new Date().getMonth() + 1 : Number(period.start.slice(5, 7));

  const { properties, rooms, days, year, entries, yearEntries, propLabel } =
    await loadDashboardData(period, property, allowedPropertyIds(access, "operations"));

  const s = summarize(entries, rooms, days);
  // 明細用：查詢是日期由舊到新，明細要最新的在上面
  const detail = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const propName = new Map(properties.map((p) => [p.id, p.name]));
  const monthly = monthlyNetSeries(yearEntries);

  return (
    <>
      <RealtimeRefresh />
      <NavBar active="dashboard" />
      <main className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3 no-print">
          <div className="flex-1 min-w-0">
            <FilterBar
              title="營業數據"
              properties={properties}
              property={property}
              mode={mode}
              year={year}
              monthNum={monthNum}
            />
          </div>
          <PrintButton />
        </div>

        {/* 列印時篩選列會被隱藏，所以另外給一個只在紙上出現的標題 */}
        <h1 className="print-only text-lg font-bold">
          營業數據 · {propLabel} · {period.label}
        </h1>

        <SummaryKpis s={s} periodLabel={period.label} propLabel={propLabel} />

        <section className="grid md:grid-cols-2 gap-5">
          <BarList title="通路統計（收入來源）" rows={s.byChannel} />
          <BarList title="支出結構" rows={s.byExpense} />
          <RoomTypeTable rows={s.byRoomType} />
          <MonthlyPnl data={monthly} />
        </section>

        {/* 原始帳目：跟著上方的民宿與期間篩選走（entries 已經過濾好了） */}
        <section className="card overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 p-4 pb-2 flex-wrap">
            <h2 className="font-semibold">帳目明細</h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {propLabel} · {period.label} · {detail.length} 筆
            </span>
          </div>
          <div className="overflow-x-auto scroll-box">
            <EntryTable
              rows={detail}
              propName={propName}
              emptyText="這段期間沒有帳目。"
            />
          </div>
        </section>
      </main>
    </>
  );
}
