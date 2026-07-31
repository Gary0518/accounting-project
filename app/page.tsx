import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import RealtimeRefresh from "@/components/RealtimeRefresh";
import EntryForm from "@/components/EntryForm";
import DeleteEntryButton from "@/components/DeleteEntryButton";
import { createClient } from "@/lib/supabase/server";
import { getAccess, allowedPropertyIds, canAny } from "@/lib/access";
import { ntd, type Entry } from "@/lib/domain";

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

  const [
    { data: properties },
    { data: paymentMethods },
    { data: channels },
    { data: roomTypes },
    { data: cats },
    { data: recent },
  ] = await Promise.all([
    supabase.from("properties").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("payment_methods").select("name").eq("active", true).order("sort_order"),
    supabase.from("channels").select("name").eq("active", true).order("sort_order"),
    supabase.from("room_types").select("name").eq("active", true).order("sort_order"),
    supabase.from("categories").select("name, direction").eq("active", true).order("sort_order"),
    supabase.from("entries").select("*").order("entry_date", { ascending: false }).limit(30),
  ]);

  const categories = {
    income: (cats ?? []).filter((c) => c.direction === "income").map((c) => c.name),
    // 清潔費由系統自動計算（房間數 × 300），不開放人工輸入
    expense: (cats ?? [])
      .filter((c) => c.direction === "expense" && c.name !== "清潔費")
      .map((c) => c.name),
  };
  // 只保留這位使用者「可輸入」的民宿（管理員 allowed=null → 全部）
  const props = (properties ?? []).filter(
    (p) => allowed === null || allowed.includes(p.id),
  );
  const propName = new Map(props.map((p) => [p.id, p.name]));

  // 多房型的訂單在資料表是好幾列（金額全掛在第一列）。把同一張訂單的列排在一起，
  // 第二列起標成「續列」——只顯示房型與間數，金額欄留白，才不會看起來像漏記帳。
  const fetched = (recent ?? []) as Entry[];
  const booking = new Map<string, Entry[]>();
  for (const e of fetched) {
    const k = e.booking_id ?? e.id;
    booking.set(k, [...(booking.get(k) ?? []), e]);
  }
  const rows = fetched.flatMap((e) => {
    const k = e.booking_id ?? e.id;
    const group = booking.get(k);
    if (!group) return []; // 這張訂單的列已經跟著第一列一起輸出了
    booking.delete(k);
    // 帶金額的那列一定排在最前面：查詢沒有保證同一張訂單的列是什麼順序，
    // 照原順序可能讓 0 元的續列排到上面去，金額就顯示在錯的那一列。
    const ordered = [...group].sort(
      (a, b) => b.amount + (b.deposit ?? 0) - (a.amount + (a.deposit ?? 0)),
    );
    return ordered.map((entry, i) => ({ entry, cont: i > 0 }));
  });

  return (
    <>
      <RealtimeRefresh />
      <NavBar active="entries" />
      {/* 手機：表單在上、最近帳目在下（單欄堆疊）；桌機：左右並排 */}
      <main className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">
        <div className="lg:sticky lg:top-20">
          <h1 className="text-lg font-bold mb-3">新增帳目</h1>
          <EntryForm
            properties={props}
            paymentMethods={paymentMethods ?? []}
            channels={channels ?? []}
            roomTypes={roomTypes ?? []}
            categories={categories}
          />
        </div>

        <section className="card overflow-hidden">
          <h2 className="font-semibold p-4 pb-2">最近帳目</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th className="p-3 font-medium">日期</th>
                  <th className="p-3 font-medium">民宿</th>
                  <th className="p-3 font-medium">科目</th>
                  <th className="p-3 font-medium">說明 / 通路</th>
                  <th className="p-3 font-medium text-right">金額</th>
                  <th className="p-3 font-medium text-center">間數</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry: e, cont }) => (
                  <tr
                    key={e.id}
                    style={{ borderTop: cont ? "none" : "1px solid var(--border)" }}
                  >
                    <td className="p-3 tabular whitespace-nowrap">
                      {cont ? "" : e.entry_date.slice(5)}
                    </td>
                    <td className="p-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {cont ? "" : e.property_id ? propName.get(e.property_id) ?? "—" : "—"}
                    </td>
                    <td className="p-3">{cont ? "" : e.category}</td>
                    <td className="p-3" style={{ color: "var(--text-secondary)" }}>
                      {cont
                        ? `↳ ${e.room_type ?? "同一張訂單"}`
                        : [e.guest_note, e.channel].filter(Boolean).join(" · ") || e.memo || "—"}
                    </td>
                    <td
                      className="p-3 tabular text-right whitespace-nowrap"
                      style={{
                        color: cont
                          ? "var(--text-muted)"
                          : e.direction === "income"
                            ? "var(--good-text)"
                            : "var(--critical)",
                      }}
                    >
                      {cont ? (
                        "—"
                      ) : (
                        <>
                          {e.direction === "income" ? "+" : "−"}
                          {ntd(e.amount + (e.direction === "income" ? e.deposit ?? 0 : 0))}
                          {e.direction === "income" && (e.deposit ?? 0) > 0 && (
                            <div
                              className="text-xs font-normal"
                              style={{ color: "var(--text-muted)" }}
                            >
                              含訂金 {ntd(e.deposit ?? 0)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 tabular text-center">
                      {e.room_nights ? e.room_nights : "—"}
                    </td>
                    <td className="p-3 text-right">
                      {/* 續列沒有自己的刪除鈕：刪第一列就是刪掉整張訂單 */}
                      {!cont && <DeleteEntryButton id={e.id} />}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                      尚無帳目，請於上方表單新增。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
