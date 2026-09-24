"use client";

import { useMemo, useState } from "react";
import EntryTable from "@/components/EntryTable";
import { filterByKeyword, type Creator, type Entry } from "@/lib/domain";

/**
 * 營業數據頁的「帳目明細」區塊。
 *
 * 拆成 client component 只為了科目篩選：明細本身已經被上方的民宿 / 期間篩好了，
 * 科目再篩一次不必回伺服器，也刻意不寫進網址——它只影響這張表，
 * 上面的 KPI 與圖表仍然要看整段期間的全貌。
 */
export default function EntryDetail({
  rows,
  properties,
  creators,
  propLabel,
  periodLabel,
}: {
  rows: Entry[];
  properties: { id: number; name: string }[];
  /** 建立人員那欄要顯示的名字（帳號 id → 中文名字） */
  creators: Creator[];
  propLabel: string;
  periodLabel: string;
}) {
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const propName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
  const creatorName = useMemo(() => new Map(creators.map((c) => [c.id, c.name])), [creators]);

  // 選單只列這段期間真的出現過的科目，收入在前、支出在後（同一組再按筆數多的排前面）
  const options = useMemo(() => {
    const seen = new Map<string, { direction: Entry["direction"]; count: number }>();
    for (const e of rows) {
      const hit = seen.get(e.category);
      if (hit) hit.count += 1;
      else seen.set(e.category, { direction: e.direction, count: 1 });
    }
    const list = [...seen].map(([name, v]) => ({ name, ...v }));
    list.sort((a, b) =>
      a.direction !== b.direction
        ? a.direction === "income"
          ? -1
          : 1
        : b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"),
    );
    return {
      income: list.filter((o) => o.direction === "income"),
      expense: list.filter((o) => o.direction === "expense"),
    };
  }, [rows]);

  // 期間一換，原本選的科目可能整個不存在了；不重設會看到一張空表
  const active = category !== "all" && rows.some((e) => e.category === category) ? category : "all";
  const byCategory = active === "all" ? rows : rows.filter((e) => e.category === active);

  const terms = keyword.trim().split(/\s+/).filter(Boolean);
  const detail = filterByKeyword(byCategory, keyword, propName, creatorName);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 p-4 pb-2 flex-wrap">
        <h2 className="font-semibold">帳目明細</h2>
        <div className="flex items-baseline gap-3 flex-wrap">
          <input
            type="search"
            className="field no-print"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋任何欄位（空格可疊加）…"
            aria-label="搜尋明細"
            style={{ width: "14rem", maxWidth: "100%", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
          />
          <select
            className="field no-print"
            value={active}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="篩選科目"
            style={{ width: "auto", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
          >
            <option value="all">全部科目</option>
            {options.income.length > 0 && (
              <optgroup label="收入">
                {options.income.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}（{o.count}）
                  </option>
                ))}
              </optgroup>
            )}
            {options.expense.length > 0 && (
              <optgroup label="支出">
                {options.expense.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}（{o.count}）
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {propLabel} · {periodLabel}
            {active === "all" ? "" : ` · ${active}`}
            {terms.length ? ` · 「${keyword.trim()}」` : ""} · {detail.length} 筆
          </span>
        </div>
      </div>
      <div className="overflow-x-auto scroll-box">
        <EntryTable
          rows={detail}
          propName={propName}
          creatorName={creatorName}
          emptyText={
            terms.length
              ? `找不到符合「${keyword.trim()}」的帳目。`
              : active === "all"
                ? "這段期間沒有帳目。"
                : `這段期間沒有「${active}」的帳目。`
          }
        />
      </div>
    </section>
  );
}
