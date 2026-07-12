"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 訂閱 entries 資料表的即時異動：只要任一同事新增 / 修改 / 刪除帳目，
 * 所有在線畫面自動重新整理 —— 這是「多人同時使用」的關鍵。
 */
export default function RealtimeRefresh() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("entries-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entries" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
