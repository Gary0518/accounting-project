import NavBar from "@/components/NavBar";
import NoAccess from "@/components/NoAccess";
import { updateUserAccess } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await getAccess();
  if (!access?.isAdmin) {
    return (
      <>
        <NavBar active="admin" />
        <NoAccess what="權限管理" />
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: profiles }, { data: properties }, { data: upa }] =
    await Promise.all([
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
      <NavBar active="admin" />
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-bold">權限管理</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            新增帳號請到 Supabase 後台（Authentication → Add user），加好後這裡就會出現。
            勾選每個人能看哪幾間民宿、以及可否輸入帳目 / 看營業數據 / 看金流數據。
          </p>
        </div>

        {(profiles ?? []).map((u) => {
          const ua = accessMap.get(u.id);
          return (
            <form
              key={u.id}
              action={updateUserAccess}
              className="card p-5 flex flex-col gap-4"
            >
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
                  <span className="font-medium">管理員（看全部＋管理權限）</span>
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
      </main>
    </>
  );
}
