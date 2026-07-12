"use client";

import { deleteEntry } from "@/app/actions";

// 刪除帳目按鈕：送出前二次確認，避免誤刪真實帳目（無法復原）。
export default function DeleteEntryButton({ id }: { id: string }) {
  return (
    <form
      action={deleteEntry}
      onSubmit={(e) => {
        if (!confirm("確定刪除這筆帳目？此動作無法復原。")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-xs"
        style={{ color: "var(--text-muted)" }}
        title="刪除"
      >
        刪除
      </button>
    </form>
  );
}
