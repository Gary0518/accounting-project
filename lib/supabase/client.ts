"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 瀏覽器端 Supabase client（Client Components 用，例如即時同步訂閱）。 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
