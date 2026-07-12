import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Capability = "input" | "operations" | "cashflow";

export interface Access {
  userId: string;
  isAdmin: boolean;
  // property_id -> 三個能力
  byProperty: Map<number, { input: boolean; operations: boolean; cashflow: boolean }>;
}

/**
 * 讀取目前登入者的權限（管理員 + 每間民宿的能力）。未登入回傳 null。
 * 以 React cache() 包裝：同一個請求內多次呼叫（頁面 + NavBar）只查一次 DB。
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("user_property_access").select("*").eq("user_id", user.id),
  ]);

  const byProperty = new Map<number, { input: boolean; operations: boolean; cashflow: boolean }>();
  for (const r of rows ?? []) {
    byProperty.set(r.property_id, {
      input: r.can_input,
      operations: r.can_operations,
      cashflow: r.can_cashflow,
    });
  }
  return { userId: user.id, isAdmin: !!profile?.is_admin, byProperty };
});

/** 該能力可存取的民宿 id 陣列；管理員回傳 null（代表全部）。 */
export function allowedPropertyIds(access: Access, cap: Capability): number[] | null {
  if (access.isAdmin) return null;
  return [...access.byProperty.entries()]
    .filter(([, c]) => c[cap])
    .map(([id]) => id);
}

/** 是否對「至少一間」民宿擁有該能力（用來決定要不要顯示頁面 / 選單）。 */
export function canAny(access: Access, cap: Capability): boolean {
  if (access.isAdmin) return true;
  return [...access.byProperty.values()].some((c) => c[cap]);
}
