import { createClient } from "@/lib/supabase/server";
import { type Creator, type Entry, type Period } from "@/lib/domain";

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

  // 供 "全部" 加總與查詢過濾用（空陣列以 [-1] 佔位避免查到全部）。
  // 只依賴傳入的 allowedIds，不需要等民宿清單查回來，所以三個查詢可以並行。
  const scopeIds = allowedIds === null ? null : allowedIds.length ? allowedIds : [-1];

  // 當月明細
  let monthQuery = supabase
    .from("entries")
    .select("*")
    .gte("entry_date", start)
    .lte("entry_date", end)
    .order("entry_date");
  if (property !== "all") monthQuery = monthQuery.eq("property_id", Number(property));
  else if (scopeIds) monthQuery = monthQuery.in("property_id", scopeIds);

  // 當年明細（完整欄位：年度範圍的圓餅 / 收款方式淨收支需要 payment_method）
  let yearQuery = supabase
    .from("entries")
    .select("*")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`);
  if (property !== "all") yearQuery = yearQuery.eq("property_id", Number(property));
  else if (scopeIds) yearQuery = yearQuery.in("property_id", scopeIds);

  // 三個查詢彼此獨立，一次同時發出（原本是一個等一個，切頁要多等兩趟來回）
  const [{ data: propsData }, { data: monthRows }, { data: yearRows }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, total_rooms")
      .eq("active", true)
      .order("sort_order"),
    monthQuery,
    yearQuery,
  ]);

  // 只保留這個能力可看的民宿（管理員 allowedIds=null → 全部）
  const properties = (propsData ?? []).filter(
    (p) => allowedIds === null || allowedIds.includes(p.id),
  );

  // 住宿率分母：單一民宿 → 該間房數；全部 → 所有民宿房數加總
  const rooms =
    property === "all"
      ? properties.reduce((s, p) => s + (p.total_rooms ?? 0), 0)
      : (properties.find((p) => String(p.id) === property)?.total_rooms ?? 0);

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

/**
 * 讀取所有帳號的顯示名字，給明細把 entries.created_by（uuid）翻成人看得懂的名字。
 * 走 profile_names view：profiles 本身的 RLS 只讓人看到自己那列，
 * 一般使用者直接查會翻不出同事的名字。
 */
export async function loadCreators(): Promise<Creator[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_names")
    .select("id, display_name, email");
  if (error) {
    // 名字翻不出來不該讓整頁掛掉，明細那欄退回顯示「—」就好
    console.error("loadCreators failed:", error);
    return [];
  }
  return (data ?? []).map((p: { id: string; display_name: string | null; email: string | null }) => ({
    id: p.id,
    name: p.display_name?.trim() || p.email || "",
  }));
}
