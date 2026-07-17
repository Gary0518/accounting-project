"use client";

import { useState, useTransition } from "react";
import { addOption, reorderOption, updateOption } from "@/app/actions";
import OptionRemoveButton from "@/components/OptionRemoveButton";

export interface OptionItem {
  id: number;
  name: string;
  amount?: number | null; // 民宿的可售房間數（其他表沒有）
}

/**
 * 一組下拉選項的管理卡片：列出現有項目（可上下排序、修改、移除）＋ 一列新增表單。
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
  const [editingId, setEditingId] = useState<number | null>(null);

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
        {items.map((it, idx) => (
          <li key={it.id} className="py-2" style={{ borderTop: "1px solid var(--border)" }}>
            {editingId === it.id ? (
              <EditRow
                table={table}
                item={it}
                amountLabel={amountLabel}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {it.name}
                  {amountLabel && it.amount != null && (
                    <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                      {amountLabel} {it.amount}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <ReorderButton
                    table={table}
                    id={it.id}
                    direction={direction}
                    dir="up"
                    disabled={idx === 0}
                  />
                  <ReorderButton
                    table={table}
                    id={it.id}
                    direction={direction}
                    dir="down"
                    disabled={idx === items.length - 1}
                  />
                  <button
                    type="button"
                    onClick={() => setEditingId(it.id)}
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                    title="修改"
                  >
                    修改
                  </button>
                  <OptionRemoveButton table={table} id={it.id} name={it.name} />
                </div>
              </div>
            )}
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

/** 上移／下移一格。到頂／到底時停用。 */
function ReorderButton({
  table,
  id,
  direction,
  dir,
  disabled,
}: {
  table: string;
  id: number;
  direction?: "income" | "expense";
  dir: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={reorderOption}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      {direction && <input type="hidden" name="direction" value={direction} />}
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        className="text-sm leading-none"
        style={{
          color: disabled ? "var(--border)" : "var(--text-muted)",
          cursor: disabled ? "default" : "pointer",
        }}
        title={dir === "up" ? "上移" : "下移"}
      >
        {dir === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

/** 內嵌的修改表單：改名稱（民宿還可改可售房間數）。存檔後自動收合。 */
function EditRow({
  table,
  item,
  amountLabel,
  onDone,
}: {
  table: string;
  item: OptionItem;
  amountLabel?: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await updateOption(fd);
          onDone();
        })
      }
      className="flex gap-2 items-end flex-wrap"
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={item.id} />
      <div className="flex-1" style={{ minWidth: 140 }}>
        <label className="label">名稱</label>
        <input
          type="text"
          name="name"
          required
          defaultValue={item.name}
          className="field"
          autoFocus
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
            defaultValue={item.amount ?? 1}
            className="field"
            inputMode="numeric"
          />
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary text-sm">
        儲存
      </button>
      <button type="button" onClick={onDone} className="btn btn-ghost text-sm">
        取消
      </button>
    </form>
  );
}
