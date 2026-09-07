import DeleteEntryButton from "@/components/DeleteEntryButton";
import EditEntryButton, { type EntryFormOptions } from "@/components/EditEntryButton";
import { ntd, type Entry } from "@/lib/domain";

/**
 * 帳目明細表。帳目輸入頁與營業數據頁共用。
 *
 * 沒有標 "use client"：本身不用任何 hook，所以在 server component（營業數據頁）
 * 和 client component（帳目輸入頁的最近帳目面板）裡都能直接用。
 *
 * @param showActions 是否顯示修改 / 刪除。營業數據頁只要 operations 權限就看得到，
 *                    但改刪要 input 權限，所以那一頁一律關掉。
 * @param editOptions 修改視窗要用的下拉選項；showActions 開著時必填。
 */
export default function EntryTable({
  rows,
  propName,
  showActions = false,
  editOptions,
  onChanged,
  emptyText = "尚無帳目。",
}: {
  rows: Entry[];
  propName: Map<number, string>;
  showActions?: boolean;
  editOptions?: EntryFormOptions;
  onChanged?: () => void;
  emptyText?: string;
}) {
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
    return ordered.map((entry, i) => ({ entry, cont: i > 0, group: ordered }));
  });

  const cols = showActions ? 9 : 8;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
          <th className="p-3 font-medium">日期</th>
          <th className="p-3 font-medium">民宿</th>
          <th className="p-3 font-medium">科目</th>
          <th className="p-3 font-medium">房型</th>
          <th className="p-3 font-medium text-center whitespace-nowrap">天數</th>
          <th className="p-3 font-medium text-center whitespace-nowrap">間數</th>
          <th className="p-3 font-medium">說明</th>
          <th className="p-3 font-medium text-right">金額</th>
          {showActions && <th className="p-3"></th>}
        </tr>
      </thead>
      <tbody>
        {display.map(({ entry: e, cont, group }) => (
          <tr key={e.id} style={{ borderTop: cont ? "none" : "1px solid var(--border)" }}>
            <td className="p-3 tabular whitespace-nowrap" style={{ color: cont ? "var(--text-muted)" : undefined }}>
              {/* 續列用 ↳ 表示它屬於上一列那張訂單 */}
              {cont ? "↳" : e.entry_date.slice(5)}
            </td>
            <td className="p-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
              {cont ? "" : e.property_id ? propName.get(e.property_id) ?? "—" : "—"}
            </td>
            <td className="p-3">{cont ? "" : e.category}</td>
            <td className="p-3 whitespace-nowrap">
              {e.room_type ?? (e.rooms ? "未指定" : "—")}
              {(e.rooms ?? 0) > 0 && (
                <span style={{ color: "var(--text-muted)" }}> ×{e.rooms}</span>
              )}
            </td>
            {/* 天數是整張訂單共用的，只寫在第一列，續列重複寫會看起來像各自住不同天數 */}
            <td className="p-3 tabular text-center">{cont ? "" : e.nights ? e.nights : "—"}</td>
            <td className="p-3 tabular text-center">{e.room_nights ? e.room_nights : "—"}</td>
            <td className="p-3" style={{ color: "var(--text-secondary)" }}>
              {cont ? (
                ""
              ) : (
                <>
                  {/* 通路來源用紅字標出來，一眼就能分辨是哪個平台來的訂單 */}
                  {e.guest_note}
                  {e.guest_note && e.channel ? " · " : null}
                  {e.channel && (
                    <span style={{ color: "var(--channel-text)" }}>{e.channel}</span>
                  )}
                  {!e.guest_note && !e.channel ? "—" : null}
                  {e.memo && (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      備註：{e.memo}
                    </div>
                  )}
                </>
              )}
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
            {showActions && (
              <td className="p-3 text-right whitespace-nowrap">
                {/* 續列沒有自己的按鈕：修改與刪除都是以整張訂單為單位。
                    清潔費是排程產生的，改了或刪了下次重算又會蓋回去，所以不給按鈕。 */}
                {cont ? null : e.category === "清潔費" ? (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    自動
                  </span>
                ) : (
                  <div className="flex gap-2 justify-end">
                    {editOptions && (
                      <EditEntryButton rows={group} options={editOptions} onSaved={onChanged} />
                    )}
                    <DeleteEntryButton id={e.id} />
                  </div>
                )}
              </td>
            )}
          </tr>
        ))}
        {display.length === 0 && (
          <tr>
            <td colSpan={cols} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
