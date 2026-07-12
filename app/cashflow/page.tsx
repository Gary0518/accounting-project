import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import FilterBar from "@/components/FilterBar";
import SummaryKpis from "@/components/SummaryKpis";
import { Donut, DivergingBars } from "@/components/dashboard";
import { loadDashboardData } from "@/lib/queries";
import { getAccess, allowedPropertyIds, canAny } from "@/lib/access";
import {
  summarize,
  monthlyNetSeries,
  paymentNet,
  handlerNet,
  resolvePeriod,
  currentMonth,
  ntd,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; property?: string; period?: string; year?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/login");
  if (!canAny(access, "cashflow")) {
    return (
      <>
        <NavBar active="cashflow" />
        <NoAccess what="金流數據" />
      </>
    );
  }

  const { month: monthParam, property: propParam, period: periodParam, year: yearParam } =
    await searchParams;
  const month = monthParam ?? currentMonth();
  const property = propParam ?? "all";
  const period = resolvePeriod(periodParam ?? "month", month, yearParam);

  const mode = period.key === "year" ? "year" : "month";
  const monthNum = mode === "year" ? new Date().getMonth() + 1 : Number(period.start.slice(5, 7));

  const { properties, rooms, days, year, entries, yearEntries, propLabel } =
    await loadDashboardData(period, property, allowedPropertyIds(access, "cashflow"));

  const s = summarize(entries, rooms, days);
  const ytd = monthlyNetSeries(yearEntries).reduce((a, b) => a + b.profit, 0);

  // 各收款方式淨收支（依所選期間）
  const netRows = paymentNet(entries).map((r) => ({ label: r.name, value: r.net }));
  const periodNetTotal = netRows.reduce((a, b) => a + b.value, 0);

  // 各經手人淨收支（依所選期間）
  const handlerNetRows = handlerNet(entries).map((r) => ({ label: r.name, value: r.net }));
  const handlerNetTotal = handlerNetRows.reduce((a, b) => a + b.value, 0);

  return (
    <>
      <RealtimeRefresh />
      <NavBar active="cashflow" />
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        <FilterBar
          title="金流數據"
          properties={properties}
          property={property}
          mode={mode}
          year={year}
          monthNum={monthNum}
        />
        <SummaryKpis s={s} periodLabel={period.label} propLabel={propLabel} year={year} ytd={ytd} />

        {/* 兩張圓餅：各收款方式的收入 / 支出比例（依所選期間） */}
        <section className="grid md:grid-cols-2 gap-5">
          <Donut title={`收入 — 各收款方式比例（${period.label}）`} rows={s.byPayment} />
          <Donut title={`支出 — 各收款方式比例（${period.label}）`} rows={s.byPaymentExpense} />
        </section>

        {/* 各收款方式淨收支（收入−支出，可盈可虧），依所選期間 */}
        <DivergingBars
          title="各收款方式淨收支（收入 − 支出）"
          note={`${period.label}　合計淨收支 ${ntd(periodNetTotal)}（清潔費為自動計算、不歸收款方式）`}
          rows={netRows}
        />

        {/* 兩張圓餅：各經手人的收入 / 支出比例（依所選期間） */}
        <section className="grid md:grid-cols-2 gap-5">
          <Donut title={`收入 — 各經手人比例（${period.label}）`} rows={s.byHandler} />
          <Donut title={`支出 — 各經手人比例（${period.label}）`} rows={s.byHandlerExpense} />
        </section>

        {/* 各經手人淨收支（收入−支出，可盈可虧），依所選期間 */}
        <DivergingBars
          title="各經手人淨收支（收入 − 支出）"
          note={`${period.label}　合計淨收支 ${ntd(handlerNetTotal)}（清潔費為自動計算、不歸經手人）`}
          rows={handlerNetRows}
        />
      </main>
    </>
  );
}
