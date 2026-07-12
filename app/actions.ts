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
