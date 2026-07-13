"use client";

import { removeOption } from "@/app/actions";

// 移除下拉選項：送出前二次確認。移除＝停用，歷史帳目不受影響（見 actions.ts removeOption）。
export default function OptionRemoveButton({
  table,
  id,
  name,
}: {
  table: string;
  id: number;
  name: string;
}) {
  return (
    <form
      action={removeOption}
      onSubmit={(e) => {
        if (!confirm(`確定移除「${name}」？之後的下拉選單不會再出現，已經記過的帳目不受影響。`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs" style={{ color: "var(--text-muted)" }} title="移除">
        移除
      </button>
    </form>
  );
}
