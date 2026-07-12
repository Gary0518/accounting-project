"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// 民宿 + 期間篩選列。三層結構：視角切換（年度/月度）→ 動態時間選擇 → 快捷標籤。
// 改變即時套用，不需按查詢。
export default function FilterBar({
  title,
  properties,
  property,
  mode,
  year,
  monthNum,
}: {
  title: string;
  properties: { id: number; name: string }[];
  property: string;
  mode: "month" | "year";
  year: number;
  monthNum: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const nav = (obj: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(obj)) p.set(k, v);
    // replace：篩選變動不塞進上一頁歷史
    router.replace(`${pathname}?${p.toString()}`);
  };

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1; // 1-based
  // 上個月（可能跨年）
  const lastMonthDate = new Date(thisYear, thisMonth - 2, 1);
  const lastY = lastMonthDate.getFullYear();
  const lastM = lastMonthDate.getMonth() + 1;

  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const goMonth = (y: number, m: number) => nav({ period: "month", month: ym(y, m) });
  const goYear = (y: number) => nav({ period: "year", year: String(y) });

  // 視角切換：切到「年度」保留目前年份；切到「月度」保留目前年月
  const setMode = (m: "month" | "year") =>
    m === "year" ? goYear(year) : goMonth(year, monthNum);

  // 上/下個月（可能跨年）
  const shiftMonth = (delta: number) => {
    const d = new Date(year, monthNum - 1 + delta, 1);
    goMonth(d.getFullYear(), d.getMonth() + 1);
  };

  // 年份下拉：明年 ~ 前 5 年（新到舊）
  const yearOpts = Array.from({ length: 7 }, (_, i) => thisYear + 1 - i);
  const monthOpts = Array.from({ length: 12 }, (_, i) => i + 1);

  // 快捷標籤 active 狀態
  const isThisYear = year === thisYear;
  const isLastYear = year === thisYear - 1;
  const isThisMonth = year === thisYear && monthNum === thisMonth;
  const isLastMonth = year === lastY && monthNum === lastM;

  const seg = (on: boolean) =>
    ({
      padding: "0.45rem 1rem",
      fontWeight: 700,
      fontSize: "0.9rem",
      cursor: "pointer",
      border: "none",
      background: on ? "var(--series-1)" : "transparent",
      color: on ? "#fff" : "var(--text-secondary)",
    }) as const;

  const pill = (on: boolean) =>
    ({
      padding: "0.3rem 0.75rem",
      borderRadius: 999,
      fontSize: "0.8rem",
      fontWeight: 600,
      cursor: "pointer",
      border: "1px solid var(--border)",
      background: on ? "var(--series-1)" : "transparent",
      color: on ? "#fff" : "var(--text-secondary)",
    }) as const;

  const arrowBtn = {
    padding: "0.25rem 0.6rem",
    fontSize: "1.15rem",
    lineHeight: 1,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
  } as const;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-lg font-bold">{title}</h1>

        <select
          className="field"
          style={{ width: "auto" }}
          value={property}
          onChange={(e) => nav({ property: e.target.value })}
        >
          <option value="all">全部民宿（加總）</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* 第一層：視角切換器（年度 / 月度，互斥；預設月度） */}
        <div
          className="inline-flex rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <button type="button" onClick={() => setMode("year")} style={seg(mode === "year")}>
            年度
          </button>
          <button type="button" onClick={() => setMode("month")} style={seg(mode === "month")}>
            月度
          </button>
        </div>

        {/* 第二層：動態時間選擇區（緊接視角切換右邊）+ 第三層：快捷標籤 */}
        {mode === "year" ? (
          // 年度：只顯示年份下拉（今年 → 至今；歷史年份 → 整年）
          <select
            className="field"
            style={{ width: "auto" }}
            value={String(year)}
            onChange={(e) => goYear(Number(e.target.value))}
          >
            {yearOpts.map((y) => (
              <option key={y} value={y}>
                {y}年{y === thisYear ? "（至今）" : ""}
              </option>
            ))}
          </select>
        ) : (
          // 月度：< [年]年 [月]月 >，箭頭切換上/下個月，點中間展開跳選
          <div className="relative">
            <div className="card inline-flex items-center" style={{ padding: "0.1rem 0.25rem" }}>
              <button
                type="button"
                style={arrowBtn}
                onClick={() => shiftMonth(-1)}
                aria-label="上個月"
              >
                ‹
              </button>
              <button
                type="button"
                className="font-semibold tabular"
                style={{
                  padding: "0.3rem 0.6rem",
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => setPickerOpen((o) => !o)}
                aria-expanded={pickerOpen}
              >
                {year}年 {monthNum}月
              </button>
              <button
                type="button"
                style={arrowBtn}
                onClick={() => shiftMonth(1)}
                aria-label="下個月"
              >
                ›
              </button>
            </div>

            {pickerOpen && (
              <>
                {/* 點外面關閉 */}
                <button
                  type="button"
                  aria-hidden
                  onClick={() => setPickerOpen(false)}
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "transparent",
                    border: "none",
                    zIndex: 40,
                    cursor: "default",
                  }}
                />
                <div
                  className="card absolute mt-1 flex gap-2 p-2"
                  style={{ zIndex: 50, top: "100%", left: 0 }}
                >
                  <select
                    className="field"
                    style={{ width: "auto" }}
                    value={String(year)}
                    onChange={(e) => {
                      goMonth(Number(e.target.value), monthNum);
                      setPickerOpen(false);
                    }}
                  >
                    {yearOpts.map((y) => (
                      <option key={y} value={y}>
                        {y}年
                      </option>
                    ))}
                  </select>
                  <select
                    className="field"
                    style={{ width: "auto" }}
                    value={String(monthNum)}
                    onChange={(e) => {
                      goMonth(year, Number(e.target.value));
                      setPickerOpen(false);
                    }}
                  >
                    {monthOpts.map((m) => (
                      <option key={m} value={m}>
                        {m}月
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* 第三層：快捷標籤 */}
        <div className="flex items-center gap-2">
          {mode === "year" ? (
            <>
              <button type="button" style={pill(isThisYear)} onClick={() => goYear(thisYear)}>
                今年
              </button>
              <button type="button" style={pill(isLastYear)} onClick={() => goYear(thisYear - 1)}>
                去年
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                style={pill(isThisMonth)}
                onClick={() => goMonth(thisYear, thisMonth)}
              >
                本月
              </button>
              <button
                type="button"
                style={pill(isLastMonth)}
                onClick={() => goMonth(lastY, lastM)}
              >
                上個月
              </button>
            </>
          )}
        </div>
      </div>
  );
}
