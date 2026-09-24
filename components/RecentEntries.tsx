"use client";

import { useEffect, useState } from "react";
import { loadRecentEntries } from "@/app/actions";
import EntryTable from "@/components/EntryTable";
import { type EntryFormOptions } from "@/components/EditEntryButton";
import { createClient } from "@/lib/supabase/client";
import {
  DIRECTION_FILTER,
  type Creator,
  type Entry,
  type ExtraFilterField,
} from "@/lib/domain";

interface Property {
  id: number;
  name: string;
}
interface Categories {
  income: string[];
  expense: string[];
}

// 翻頁鈕沒得按時淡掉（.btn 是純 CSS class，沒有 :disabled 樣式）
const disabledStyle = (off: boolean) =>
  off ? { opacity: 0.4, cursor: "default" as const } : undefined;

/**
 * 右側「最近帳目」面板。
 *
 * 刻意不預設載入：進站時 view 是空字串，畫面顯示提示、完全不查資料庫。
 * 使用者在左邊表單選民宿（或直接用這裡的下拉）之後才載入那一間，首頁因此快很多。
 * 一次也只查一頁；後面的帳目要按「下一頁」才會去撈。
 */
export default function RecentEntries({
  properties,
  creators,
  filterCategories,
  view,
  onViewChange,
  reloadToken,
  editOptions,
}: {
  properties: Property[];
  /** 明細「建立人員」那欄要顯示的名字（帳號 id → 中文名字） */
  creators: Creator[];
  /** 科目篩選的選項。比表單的 categories 多一個「清潔費」——它不給人工輸入，但帳上有，要能篩 */
  filterCategories: Categories;
  view: string;
  onViewChange: (v: string) => void;
  reloadToken: number;
  /** 修改視窗要用的下拉選項 */
  editOptions: EntryFormOptions;
}) {
  // 空字串 = 全部科目。篩選是下到查詢裡的，不是只濾當頁。
  const [category, setCategory] = useState("");
  // 其他篩選（通路 / 收款方式 / 房型 / 人員），值是「欄位:值」；空字串 = 不篩。跟科目篩選同時成立
  const [extra, setExtra] = useState("");
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同事新增 / 刪除帳目時要跟著更新，靠這個計數器觸發重新載入
  const [tick, setTick] = useState(0);
  // 每一頁的起始列號；索引就是頁碼，最後一個是目前這頁。
  // 存整串是因為每頁吃掉的列數不固定（後端會把切一半的訂單補完），
  // 只記目前 offset 的話回上一頁算不回去。
  const [offsets, setOffsets] = useState<number[]>([0]);
  // 目前這頁的下一頁從哪裡開始；沒有下一頁時用不到
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const page = offsets.length - 1;

  // 換民宿、或自己剛存了一筆帳 → 回到第一頁（底下的列全變了，停在第 3 頁沒有意義）。
  // 在 render 當下改，effect 才不會先用舊的頁碼多查一次。
  // 同事那邊的異動（tick）不重設頁碼，只重新載入目前這頁，免得看舊帳看到一半被彈回第一頁。
  // 換科目跟換民宿一樣：底下的列全變了，頁碼要回到第一頁
  const resetKey = `${view}|${category}|${extra}|${reloadToken}`;
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (resetKey !== seenResetKey) {
    setSeenResetKey(resetKey);
    setOffsets([0]);
  }

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
      setHasMore(false);
      setError(null);
      return;
    }
    // 快速連續切換民宿或連按翻頁時，晚回來的舊請求不可以蓋掉新的結果
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRecentEntries(view, offsets[page], category, extra)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setHasMore(data.hasMore);
        // 記下下一頁的起點，按「下一頁」時才知道要從哪裡撈
        setNextOffset(data.nextOffset);
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
  }, [view, category, extra, offsets, page, tick]);

  const categoryLabel = (c: string) =>
    c === DIRECTION_FILTER.income ? "收入" : c === DIRECTION_FILTER.expense ? "支出" : c;

  // 其他篩選的分組：每組一個 optgroup，像科目那樣分開
  const names = (list: { name: string }[]) => list.map((o) => ({ value: o.name, name: o.name }));
  const extraGroups: {
    field: ExtraFilterField;
    label: string;
    options: { value: string; name: string }[];
  }[] = [
    { field: "channel", label: "來源通路", options: names(editOptions.channels) },
    { field: "payment", label: "收款方式", options: names(editOptions.paymentMethods) },
    { field: "room", label: "房型", options: names(editOptions.roomTypes) },
    { field: "creator", label: "人員", options: creators.map((c) => ({ value: c.id, name: c.name })) },
  ];
  const extraLabel = (() => {
    const sep = extra.indexOf(":");
    const g = extraGroups.find((g) => g.field === extra.slice(0, sep));
    return g?.options.find((o) => o.value === extra.slice(sep + 1))?.name ?? "";
  })();
  // 空狀態提示：兩個篩選都有選時用「、」接起來
  const filterLabel = [category && categoryLabel(category), extra && extraLabel]
    .filter(Boolean)
    .join("、");

  const propName = new Map(properties.map((p) => [p.id, p.name]));
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 pb-2 flex-wrap">
        <h2 className="font-semibold">最近帳目</h2>
        <div className="flex items-center gap-2 flex-wrap">
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
          <select
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="篩選科目"
            disabled={!view}
            style={{
              width: "auto",
              maxWidth: "100%",
              padding: "0.35rem 0.5rem",
              fontSize: "0.9rem",
              opacity: view ? 1 : 0.5,
            }}
          >
            <option value="">全部科目</option>
            <optgroup label="收入">
              <option value={DIRECTION_FILTER.income}>全部收入</option>
              {filterCategories.income.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
            <optgroup label="支出">
              <option value={DIRECTION_FILTER.expense}>全部支出</option>
              {filterCategories.expense.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            className="field"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            aria-label="其他篩選"
            disabled={!view}
            style={{
              width: "auto",
              maxWidth: "100%",
              padding: "0.35rem 0.5rem",
              fontSize: "0.9rem",
              opacity: view ? 1 : 0.5,
            }}
          >
            <option value="">其他篩選</option>
            {extraGroups
              .filter((g) => g.options.length)
              .map((g) => (
                <optgroup key={g.field} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={`${g.field}:${o.value}`}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
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
        <>
          <div className="overflow-x-auto" style={{ opacity: loading ? 0.5 : 1 }}>
            <EntryTable
              rows={rows}
              propName={propName}
              creatorName={creatorName}
              showActions
              editOptions={editOptions}
              onChanged={() => setTick((t) => t + 1)}
              emptyText={
                page > 0
                  ? "這一頁沒有帳目了。"
                  : filterLabel
                    ? `這間民宿沒有「${filterLabel}」的帳目。`
                    : "這間民宿還沒有帳目。"
              }
            />
          </div>
          {(page > 0 || hasMore) && (
            <div
              className="flex items-center justify-between gap-3 p-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                type="button"
                className="btn btn-ghost text-sm"
                // 上一頁只是把最後一個 offset 丟掉，不用重算
                onClick={() => setOffsets((o) => o.slice(0, -1))}
                disabled={page === 0 || loading}
                style={disabledStyle(page === 0 || loading)}
              >
                ← 上一頁
              </button>
              <span className="text-sm tabular" style={{ color: "var(--text-muted)" }}>
                第 {page + 1} 頁
              </span>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                // 下一頁的起點由後端給（每頁吃掉的列數不固定），按了才去查那一頁
                onClick={() => setOffsets((o) => [...o, nextOffset])}
                disabled={!hasMore || loading}
                style={disabledStyle(!hasMore || loading)}
              >
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
