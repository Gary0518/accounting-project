import { createClient } from "@/lib/supabase/server";
import { type Entry, type Period } from "@/lib/domain";

/**
 * 讀取儀表板 / 金流頁共用的資料：民宿清單、期間帳目、趨勢年帳目、住宿率分母。
 * @param period      查詢期間（起訖日期、天數、趨勢年）
 * @param property    "all" 或民宿 id 字串
 * @param allowedIds  可存取的民宿 id；null = 全部（管理員）
 */
export async function loadDashboardData(
  period: Period,
  property: string,
  allowedIds: number[] | null = null,
) {
  const supabase = await createClient();
  const { start, end, days, trendYear } = period;
  const year = trendYear;

  const { data: propsData } = await supabase
    .from("properties")
    .select("id, name, total_rooms")
    .eq("active", true)
    .order("sort_order");
  // 只保留這個能力可看的民宿（管理員 allowedIds=null → 全部）
  const properties = (propsData ?? []).filter(
    (p) => allowedIds === null || allowedIds.includes(p.id),
  );
  // 供 "全部" 加總與查詢過濾用（空陣列以 [-1] 佔位避免查到全部）
  const scopeIds = allowedIds === null ? null : allowedIds.length ? allowedIds : [-1];

  // 住宿率分母：單一民宿 → 該間房數；全部 → 所有民宿房數加總
  const rooms =
    property === "all"
      ? properties.reduce((s, p) => s + (p.total_rooms ?? 0), 0)
      : (properties.find((p) => String(p.id) === property)?.total_rooms ?? 0);

  // 當月明細
  let monthQuery = supabase
    .from("entries")
    .select("*")
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date");
  if (property !== "all") monthQuery = monthQuery.eq("property_id", Number(property));
  else if (scopeIds) monthQuery = monthQuery.in("property_id", scopeIds);
  const { data: monthRows } = await monthQuery;

  // 當年明細（完整欄位：年度範圍的圓餅 / 收款方式淨收支需要 payment_method）
  let yearQuery = supabase
    .from("entries")
    .select("*")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`);
  if (property !== "all") yearQuery = yearQuery.eq("property_id", Number(property));
  else if (scopeIds) yearQuery = yearQuery.in("property_id", scopeIds);
  const { data: yearRows } = await yearQuery;

  return {
    properties,
    rooms,
    days,
    year,
    entries: (monthRows ?? []) as Entry[],
    yearEntries: (yearRows ?? []) as Entry[],
    propLabel:
      property === "all"
        ? "全部民宿"
        : (properties.find((p) => String(p.id) === property)?.name ?? "全部民宿"),
  };
}
