import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieList = { name: string; value: string; options?: CookieOptions }[];

/**
 * 伺服器端 Supabase client（Server Components / Server Actions / Route Handlers 用）。
 * Next 15 的 cookies() 為非同步，故此函式為 async。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieList) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 從 Server Component 呼叫時無法寫 cookie，交由 middleware 處理即可。
          }
        },
      },
    },
  );
}
