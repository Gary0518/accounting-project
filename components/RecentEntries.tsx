"use client";

import { useEffect, useState } from "react";
import { loadRecentEntries } from "@/app/actions";
import EntryTable from "@/components/EntryTable";
import { type EntryFormOptions } from "@/components/EditEntryButton";
import { createClient } from "@/lib/supabase/client";
import { type Entry } from "@/lib/domain";

interface Property {
  id: number;
  name: string;
}

/**
 * 右側「最近帳目」面板。
 *
 * 刻意不預設載入：進站時 view 是空字串，畫面顯示提示、完全不查資料庫。
 * 使用者在左邊表單選民宿（或直接用這裡的下拉）之後才載入那一間，首頁因此快很多。
 */
export default function RecentEntries({
  properties,
  view,
  onViewChange,
  reloadToken,
  editOptions,
}: {
  properties: Property[];
  view: string;
  onViewChange: (v: string) => void;
  reloadToken: number;
  /** 修改視窗要用的下拉選項 */
  editOptions: EntryFormOptions;
}) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同事新增 / 刪除帳目時要跟著更新，靠這個計數器觸發重新載入
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("recent-entries-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entries" },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!view) {
      setRows([]);
      setError(null);
      return;
    }
    // 快速連續切換民宿時，晚回來的舊請求不可以蓋掉新的結果
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRecentEntries(view)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setError("讀取失敗，請重新選一次民宿。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, reloadToken, tick]);

  const propName = new Map(properties.map((p) => [p.id, p.name]));

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 pb-2 flex-wrap">
        <h2 className="font-semibold">最近帳目</h2>
        <select
          className="field"
          value={view}
          onChange={(e) => onViewChange(e.target.value)}
          aria-label="要看哪間民宿的最近帳目"
          style={{ width: "auto", maxWidth: "100%", padding: "0.35rem 0.5rem", fontSize: "0.9rem" }}
        >
          <option value="">選擇民宿…</option>
          {properties.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
          <option value="all">全部民宿</option>
        </select>
      </div>

      {!view ? (
        <p className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          選一間民宿，這裡就會顯示它的最近帳目。
        </p>
      ) : error ? (
        <p className="p-6 text-center text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : loading && rows.length === 0 ? (
        <p className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          載入中…
        </p>
      ) : (
        <div className="overflow-x-auto" style={{ opacity: loading ? 0.5 : 1 }}>
          <EntryTable
            rows={rows}
            propName={propName}
            showActions
            editOptions={editOptions}
            onChanged={() => setTick((t) => t + 1)}
            emptyText="這間民宿還沒有帳目。"
          />
        </div>
      )}
    </section>
  );
}
