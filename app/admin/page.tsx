import Link from "next/link";
import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import OptionManager, { type OptionItem } from "@/components/OptionManager";
import { updateUserAccess } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { CLEANING_FEE_PER_STAY, CLEANING_HANDLER, CLEANING_PAYMENT } from "@/lib/domain";

export const dynamic = "force-dynamic";

type Tab = "access" | "options";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const access = await getAccess();
  if (!access?.isAdmin) {
    return (
      <>
        <NavBar active="admin" />
        <NoAccess what="設定" />
      </>
    );
  }

  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "options" ? "options" : "access";

  return (
    <>
      <NavBar active="admin" />
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-bold">設定</h1>
          <div className="flex gap-4 mt-3 text-sm">
            <TabLink tab="access" current={tab} label="管理權限" />
            <TabLink tab="options" current={tab} label="調整項目" />
          </div>
        </div>

        {tab === "access" ? <AccessSection /> : <OptionsSection />}
      </main>
    </>
  );
}

function TabLink({ tab, current, label }: { tab: Tab; current: Tab; label: string }) {
  const on = tab === current;
  return (
    <Link
      href={`/admin?tab=${tab}`}
      className="pb-1"
      style={{
        fontWeight: on ? 700 : 500,
        color: on ? "var(--text-primary)" : "var(--text-secondary)",
        borderBottom: on ? "2px solid var(--series-1)" : "2px solid transparent",
      }}
    >
      {label}
    </Link>
  );
}

// ---------- 分頁 1：管理權限 ----------
async function AccessSection() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: properties }, { data: upa }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, is_admin").order("created_at"),
    supabase.from("properties").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("user_property_access").select("*"),
  ]);

  const props = properties ?? [];
  // user_id -> property_id -> caps
  const accessMap = new Map<string, Map<number, { i: boolean; o: boolean; c: boolean }>>();
  for (const r of upa ?? []) {
    if (!accessMap.has(r.user_id)) accessMap.set(r.user_id, new Map());
    accessMap
      .get(r.user_id)!
      .set(r.property_id, { i: r.can_input, o: r.can_operations, c: r.can_cashflow });
  }

  return (
    <>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        新增帳號請到 Supabase 後台（Authentication → Add user），加好後這裡就會出現。
        勾選每個人能看哪幾間民宿、以及可否輸入帳目 / 看營業數據 / 看金流數據。
      </p>

      {(profiles ?? []).map((u) => {
        const ua = accessMap.get(u.id);
        return (
          <form key={u.id} action={updateUserAccess} className="card p-5 flex flex-col gap-4">
            <input type="hidden" name="user_id" value={u.id} />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-semibold">{u.display_name || u.email || u.id}</div>
                {u.email && (
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {u.email}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_admin" defaultChecked={u.is_admin} />
                <span className="font-medium">管理員（看全部＋改設定）</span>
              </label>
            </div>

            <div>
              <label className="label">中文名字（會顯示為帳目的經手人）</label>
              <input
                type="text"
                name="display_name"
                defaultValue={u.display_name ?? ""}
                placeholder="例：陳怡安"
                className="field"
                style={{ maxWidth: 260 }}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                    <th className="p-2 font-medium">民宿</th>
                    <th className="p-2 font-medium text-center">輸入帳目</th>
                    <th className="p-2 font-medium text-center">營業數據</th>
                    <th className="p-2 font-medium text-center">金流數據</th>
                  </tr>
                </thead>
                <tbody>
                  {props.map((p) => {
                    const c = ua?.get(p.id);
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2 text-center">
                          <input type="checkbox" name={`input_${p.id}`} defaultChecked={c?.i} />
                        </td>
                        <td className="p-2 text-center">
                          <input type="checkbox" name={`operations_${p.id}`} defaultChecked={c?.o} />
                        </td>
                        <td className="p-2 text-center">
                          <input type="checkbox" name={`cashflow_${p.id}`} defaultChecked={c?.c} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button type="submit" className="btn btn-primary self-start text-sm">
              儲存這位使用者
            </button>
          </form>
        );
      })}
    </>
  );
}

// ---------- 分頁 2：調整項目（帳目輸入頁的每個下拉選單）----------
async function OptionsSection() {
  const supabase = await createClient();
  const [{ data: properties }, { data: cats }, { data: payments }, { data: channels }, { data: roomTypes }] =
    await Promise.all([
      supabase.from("properties").select("id, name, total_rooms").eq("active", true).order("sort_order"),
      supabase.from("categories").select("id, name, direction").eq("active", true).order("sort_order"),
      supabase.from("payment_methods").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("channels").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("room_types").select("id, name").eq("active", true).order("sort_order"),
    ]);

  const propItems: OptionItem[] = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    amount: p.total_rooms,
  }));
  // 清潔費是系統自動算的，不出現在支出科目的下拉選單，這裡也不讓它被誤刪
  const catItems = (dir: "income" | "expense"): OptionItem[] =>
    (cats ?? [])
      .filter((c) => c.direction === dir && c.name !== "清潔費")
      .map((c) => ({ id: c.id, name: c.name }));
  const plain = (rows: { id: number; name: string }[] | null): OptionItem[] =>
    (rows ?? []).map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        這裡管的是「帳目輸入」頁每個下拉選單的內容。
        <strong>移除＝停用</strong>：該項目之後不會再出現在下拉選單，但已經記過的帳目和報表數字完全不受影響。
        移除後再新增同名項目，會把它重新啟用。
      </p>

      <div className="grid md:grid-cols-2 gap-5 items-start">
        <OptionManager
          table="properties"
          title="民宿"
          hint="可售房間數是住宿率的分母，填錯會讓營業數據的住宿率失真。"
          items={propItems}
          amountLabel="可售房間數"
          placeholder="例：好室行旅"
        />
        <OptionManager
          table="payment_methods"
          title="收款方式"
          hint="收入與支出、以及訂金都用同一份清單。"
          items={plain(payments)}
          placeholder="例：匯款（台企-志剛）"
        />
        <OptionManager
          table="categories"
          title="收入來源"
          hint="切到「收入」時的科目下拉。「住宿費」是計算住宿筆數與住宿率的依據，建議別移除。"
          items={catItems("income")}
          direction="income"
          placeholder="例：傭金收入"
        />
        <OptionManager
          table="categories"
          title="支出科目"
          hint={`切到「支出」時的科目下拉。清潔費由系統自動計算（住宿筆數 × ${CLEANING_FEE_PER_STAY}，記在 ${CLEANING_HANDLER} / ${CLEANING_PAYMENT}），不在此管理。`}
          items={catItems("expense")}
          direction="expense"
          placeholder="例：修繕費"
        />
        <OptionManager
          table="channels"
          title="來源（通路）"
          items={plain(channels)}
          placeholder="例：agoda"
        />
        <OptionManager
          table="room_types"
          title="房型"
          items={plain(roomTypes)}
          placeholder="例：大床房"
        />
      </div>
    </>
  );
}
