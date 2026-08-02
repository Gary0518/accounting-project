"use client";

import { useEffect, useState } from "react";
import { loadRecentEntries } from "@/app/actions";
import DeleteEntryButton from "@/components/DeleteEntryButton";
import { createClient } from "@/lib/supabase/client";
import { ntd, type Entry } from "@/lib/domain";

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
}: {
  properties: Property[];
  view: string;
  onViewChange: (v: string) => void;
  reloadToken: number;
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

  // 多房型的訂單在資料表是好幾列（金額全掛在第一列）。把同一張訂單的列排在一起，
  // 第二列起標成「續列」——只顯示房型與間數，金額欄留白，才不會看起來像漏記帳。
  const booking = new Map<string, Entry[]>();
  for (const e of rows) {
    const k = e.booking_id ?? e.id;
    booking.set(k, [...(booking.get(k) ?? []), e]);
  }
  const display = rows.flatMap((e) => {
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
              {display.map(({ entry: e, cont }) => (
                <tr key={e.id} style={{ borderTop: cont ? "none" : "1px solid var(--border)" }}>
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
                          <div className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                            含訂金 {ntd(e.deposit ?? 0)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-3 tabular text-center">{e.room_nights ? e.room_nights : "—"}</td>
                  <td className="p-3 text-right">
                    {/* 續列沒有自己的刪除鈕：刪第一列就是刪掉整張訂單 */}
                    {!cont && <DeleteEntryButton id={e.id} />}
                  </td>
                </tr>
              ))}
              {display.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                    這間民宿還沒有帳目。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
