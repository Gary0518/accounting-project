"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** 新增一筆帳目（收入或支出）。 */
export async function createEntry(formData: FormData) {
  const supabase = await createClient();

  // 經手人不再由表單輸入，改為自動辨識目前登入的帳號（收入支出皆同）。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let handler: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle();
    handler = profile?.display_name || profile?.email || user.email || null;
  }

  const direction = String(formData.get("direction")) as "income" | "expense";
  const toInt = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const toStr = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : String(v);
  };

  const payload = {
    property_id: Number(formData.get("property_id")),
    entry_date: String(formData.get("entry_date")),
    direction,
    category: String(formData.get("category")),
    amount: Number(formData.get("amount")),
    payment_method: toStr("payment_method"),
    deposit: direction === "income" ? Number(formData.get("deposit") || 0) : 0,
    deposit_payment_method:
      direction === "income" ? toStr("deposit_payment_method") : null,
    channel: direction === "income" ? toStr("channel") : null,
    guest_note: direction === "income" ? toStr("guest_note") : null,
    rooms: direction === "income" ? toInt("rooms") : null,
    room_type: direction === "income" ? toStr("room_type") : null,
    nights: direction === "income" ? toInt("nights") : null,
    handler,
    memo: toStr("memo"),
  };

  const { error } = await supabase.from("entries").insert(payload);
  if (error) {
    console.error("createEntry failed:", error);
    throw new Error("新增帳目失敗");
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

/** 管理員：更新某使用者的權限（是否管理員 + 每間民宿的三個能力）。 */
export async function updateUserAccess(formData: FormData) {
  // 縱深防禦：不只靠 RLS，後端動作自己也確認呼叫者為管理員。
  const access = await getAccess();
  if (!access?.isAdmin) throw new Error("需要管理員權限");

  const supabase = await createClient();
  const userId = String(formData.get("user_id"));
  const isAdmin = formData.get("is_admin") === "on";
  const displayNameRaw = String(formData.get("display_name") ?? "").trim();
  const displayName = displayNameRaw === "" ? null : displayNameRaw;

  const { data: props } = await supabase
    .from("properties")
    .select("id")
    .eq("active", true);

  const rows = (props ?? []).map((p) => ({
    user_id: userId,
    property_id: p.id,
    can_input: formData.get(`input_${p.id}`) === "on",
    can_operations: formData.get(`operations_${p.id}`) === "on",
    can_cashflow: formData.get(`cashflow_${p.id}`) === "on",
  }));

  if (rows.length) {
    const { error } = await supabase.from("user_property_access").upsert(rows);
    if (error) {
      console.error("updateUserAccess (upa) failed:", error);
      throw new Error("更新權限失敗");
    }
  }
  const { error: pErr } = await supabase
    .from("profiles")
    .update({ is_admin: isAdmin, display_name: displayName })
    .eq("id", userId);
  if (pErr) {
    console.error("updateUserAccess (profile) failed:", pErr);
    throw new Error("更新權限失敗");
  }

  revalidatePath("/admin");
}

// =============================================================
// 設定 → 調整項目：帳目輸入頁那些下拉選單的內容
// =============================================================

/**
 * 可管理的下拉選單資料表。
 * 這是白名單：table 名稱來自表單，若不先擋掉就等於讓前端指定要動哪張表。
 * amountField = 除了名稱外還要編輯的數字欄位（民宿的可售房間數）。
 */
const OPTION_TABLES = {
  properties: { label: "民宿", amountField: "total_rooms" },
  categories: { label: "科目", amountField: null },
  payment_methods: { label: "收款方式", amountField: null },
  channels: { label: "通路", amountField: null },
  room_types: { label: "房型", amountField: null },
} as const;

export type OptionTable = keyof typeof OPTION_TABLES;

function assertOptionTable(v: FormDataEntryValue | null): OptionTable {
  const t = String(v);
  if (!(t in OPTION_TABLES)) throw new Error("未知的項目類別");
  return t as OptionTable;
}

async function requireAdmin() {
  // 縱深防禦：這些表的 RLS 對所有登入者開放寫入，所以後端動作自己再確認一次。
  const access = await getAccess();
  if (!access?.isAdmin) throw new Error("需要管理員權限");
}

/**
 * 新增一個下拉選項。
 * 若同名項目曾被停用過，改為重新啟用（因為 name 有 unique 限制，直接 insert 會撞）。
 */
export async function addOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("名稱不可空白");

  const supabase = await createClient();
  const { amountField } = OPTION_TABLES[table];

  // 科目的唯一鍵是 (name, direction)，其餘表只有 name
  const direction =
    table === "categories" ? String(formData.get("direction")) : null;
  if (table === "categories" && direction !== "income" && direction !== "expense") {
    throw new Error("科目必須指定收入或支出");
  }

  const row: Record<string, unknown> = { name, active: true };
  if (direction) row.direction = direction;
  if (amountField) {
    const n = Number(formData.get(amountField));
    if (Number.isFinite(n) && n > 0) row[amountField] = n;
  }

  // 先找同名（同 direction）的既有列：有就復用，沒有才新增
  let q = supabase.from(table).select("id").eq("name", name).limit(1);
  if (direction) q = q.eq("direction", direction);
  const { data: existing } = await q;

  const { error } = existing?.length
    ? await supabase.from(table).update(row).eq("id", existing[0].id)
    : await supabase.from(table).insert(row);

  if (error) {
    console.error(`addOption(${table}) failed:`, error);
    throw new Error("新增項目失敗");
  }
  revalidateAll();
}

/**
 * 移除一個下拉選項 —— 停用（active=false）而非真的刪列。
 * 理由：帳目已經用文字記下當時的科目 / 收款方式，民宿更是被 entries.property_id 外鍵參照；
 * 真的 delete 會讓歷史帳目對不到或直接違反外鍵。停用後選單不再出現，歷史帳目完好。
 */
export async function removeOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("項目不存在");

  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ active: false }).eq("id", id);
  if (error) {
    console.error(`removeOption(${table}) failed:`, error);
    throw new Error("移除項目失敗");
  }
  revalidateAll();
}

/** 選單內容變動會影響帳目輸入頁與兩個儀表板，全部重新產生。 */
function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

/** 刪除一筆帳目。 */
export async function deleteEntry(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) {
    console.error("deleteEntry failed:", error);
    throw new Error("刪除帳目失敗");
  }
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}
