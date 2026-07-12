import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import FilterBar from "@/components/FilterBar";
import SummaryKpis from "@/components/SummaryKpis";
import { BarList, RoomTypeTable, MonthlyPnl } from "@/components/dashboard";
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
  const monthly = monthlyNetSeries(yearEntries);
  const ytd = monthly.reduce((a, b) => a + b.profit, 0);

  return (
    <>
      <RealtimeRefresh />
      <NavBar active="dashboard" />
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        <FilterBar
          title="營業數據"
          properties={properties}
          property={property}
          mode={mode}
          year={year}
          monthNum={monthNum}
        />
        <SummaryKpis s={s} periodLabel={period.label} propLabel={propLabel} year={year} ytd={ytd} />

        <section className="grid md:grid-cols-2 gap-5">
          <BarList title="通路統計（收入來源）" rows={s.byChannel} />
          <BarList title="支出結構" rows={s.byExpense} />
          <RoomTypeTable rows={s.byRoomType} />
          <MonthlyPnl data={monthly} />
        </section>
      </main>
    </>
  );
}
