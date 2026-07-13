import { addOption } from "@/app/actions";
import OptionRemoveButton from "@/components/OptionRemoveButton";

export interface OptionItem {
  id: number;
  name: string;
  amount?: number | null; // 民宿的可售房間數（其他表沒有）
}

/**
 * 一組下拉選項的管理卡片：列出現有項目（可移除）＋ 一列新增表單。
 * 對應「帳目輸入」頁的一個下拉選單。
 */
export default function OptionManager({
  table,
  title,
  hint,
  items,
  direction,
  amountLabel,
  placeholder,
}: {
  table: string;
  title: string;
  hint?: string;
  items: OptionItem[];
  direction?: "income" | "expense"; // 只有科目需要
  amountLabel?: string; // 有值才顯示數字欄（民宿：可售房間數）
  placeholder?: string;
}) {
  return (
    <section className="card p-5 flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {hint && (
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {hint}
          </p>
        )}
      </div>

      <ul className="flex flex-col">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-3 py-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="text-sm">
              {it.name}
              {amountLabel && it.amount != null && (
                <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                  {amountLabel} {it.amount}
                </span>
              )}
            </span>
            <OptionRemoveButton table={table} id={it.id} name={it.name} />
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-3 text-sm" style={{ color: "var(--text-muted)" }}>
            目前沒有項目，用下面的欄位新增。
          </li>
        )}
      </ul>

      <form action={addOption} className="flex gap-2 items-end flex-wrap">
        <input type="hidden" name="table" value={table} />
        {direction && <input type="hidden" name="direction" value={direction} />}
        <div className="flex-1" style={{ minWidth: 140 }}>
          <label className="label">新增項目</label>
          <input
            type="text"
            name="name"
            required
            placeholder={placeholder}
            className="field"
          />
        </div>
        {amountLabel && (
          <div style={{ width: 110 }}>
            <label className="label">{amountLabel}</label>
            <input
              type="number"
              name="total_rooms"
              min="1"
              step="1"
              defaultValue={1}
              className="field"
              inputMode="numeric"
            />
          </div>
        )}
        <button type="submit" className="btn btn-primary text-sm">
          新增
        </button>
      </form>
    </section>
  );
}
