"use client";

import { useMemo, useState } from "react";
import EntryTable from "@/components/EntryTable";
import { type Entry } from "@/lib/domain";

/** 一列帳目裡所有能搜的文字（表上看得到的欄位，加上收款方式、經手人這些表上沒列的）。 */
function searchText(e: Entry, propName: Map<number, string>): string {
  const total = e.amount + (e.direction === "income" ? e.deposit ?? 0 : 0);
  const [y, m, d] = e.entry_date.split("-");
  return [
    // 日期收連字號與斜線兩種寫法，打「09-23」「9/23」「2026/09/23」都找得到
    e.entry_date,
    `${y}/${m}/${d}`,
    `${Number(m)}/${Number(d)}`,
    e.property_id ? propName.get(e.property_id) : null,
    e.direction === "income" ? "收入" : "支出",
    e.category,
    // 沒填房型但有間數時，表上顯示「未指定」，讓這個字也搜得到
    e.room_type ?? (e.rooms ? "未指定" : null),
    e.rooms,
    e.rooms ? `${e.rooms}間` : null,
    e.nights,
    e.nights ? `${e.nights}天` : null,
    e.room_nights,
    e.guest_note,
    e.channel,
    e.memo,
    // 表上這兩欄有前綴字，搜「備註」「訂金」要能把有寫的那些帳撈出來
    e.memo ? "備註" : null,
    e.payment_method,
    e.deposit_payment_method,
    // 金額用原始數字與千分位兩種寫法，打「3000」或「3,000」都找得到
    e.amount,
    e.amount.toLocaleString("en-US"),
    e.deposit || null,
    e.deposit ? e.deposit.toLocaleString("en-US") : null,
    e.deposit ? "訂金" : null,
    total,
    total.toLocaleString("en-US"),
    e.handler,
    e.created_by,
  ]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join(" ")
    .toLowerCase();
}

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
  propLabel,
  periodLabel,
}: {
  rows: Entry[];
  properties: { id: number; name: string }[];
  propLabel: string;
  periodLabel: string;
}) {
  const [category, setCategory] = useState("all");
  const [keyword, setKeyword] = useState("");
  const propName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);

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

  // 關鍵字用空白隔開、每個都要對到（「agoda 大床」= 同時有 agoda 和大床）。
  // 以整張訂單為單位比對：多房型訂單只要其中一列對到就整張留下，
  // 不然只剩一列續列的話，明細表會把它當成第一列、金額顯示成 0。
  const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const bookingText = new Map<string, string>();
  if (terms.length) {
    for (const e of byCategory) {
      const k = e.booking_id ?? e.id;
      bookingText.set(k, (bookingText.get(k) ?? "") + " " + searchText(e, propName));
    }
  }
  const detail = terms.length
    ? byCategory.filter((e) => {
        const text = bookingText.get(e.booking_id ?? e.id) ?? "";
        return terms.every((t) => text.includes(t));
      })
    : byCategory;

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
