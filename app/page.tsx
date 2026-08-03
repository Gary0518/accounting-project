import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import EntriesWorkspace from "@/components/EntriesWorkspace";
import { createClient } from "@/lib/supabase/server";
import { getAccess, allowedPropertyIds, canAny } from "@/lib/access";

export const dynamic = "force-dynamic";

// 首頁 = 帳目輸入（登入後預設進到這裡）
export default async function EntriesPage() {
  const access = await getAccess();
  if (!access) redirect("/login");
  if (!canAny(access, "input")) {
    // 沒有輸入權限：導到第一個有權限的頁面
    if (canAny(access, "operations")) redirect("/dashboard");
    if (canAny(access, "cashflow")) redirect("/cashflow");
    return (
      <>
        <NavBar active="entries" />
        <NoAccess what="帳目輸入" />
      </>
    );
  }
  const allowed = allowedPropertyIds(access, "input");

  const supabase = await createClient();

  // 不在這裡查帳目：右邊面板進站時是空的，使用者選了民宿才由 loadRecentEntries 載入。
  const [
    { data: properties },
    { data: paymentMethods },
    { data: channels },
    { data: roomTypes },
    { data: cats },
  ] = await Promise.all([
    supabase.from("properties").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("payment_methods").select("name").eq("active", true).order("sort_order"),
    supabase.from("channels").select("name").eq("active", true).order("sort_order"),
    supabase.from("room_types").select("name").eq("active", true).order("sort_order"),
    supabase.from("categories").select("name, direction").eq("active", true).order("sort_order"),
  ]);

  const categories = {
    income: (cats ?? []).filter((c) => c.direction === "income").map((c) => c.name),
    // 清潔費由系統每月底自動記一筆（房間數 × 300），不開放人工輸入
    expense: (cats ?? [])
      .filter((c) => c.direction === "expense" && c.name !== "清潔費")
      .map((c) => c.name),
  };
  // 只保留這位使用者「可輸入」的民宿（管理員 allowed=null → 全部）
  const props = (properties ?? []).filter(
    (p) => allowed === null || allowed.includes(p.id),
  );

  return (
    <>
      <RealtimeRefresh />
      <NavBar active="entries" />
      {/* 手機：表單在上、最近帳目在下（單欄堆疊）；桌機：左右並排 */}
      <EntriesWorkspace
        properties={props}
        paymentMethods={paymentMethods ?? []}
        channels={channels ?? []}
        roomTypes={roomTypes ?? []}
        categories={categories}
      />
    </>
  );
}
