"use client";

import { useState } from "react";
import EntryForm from "@/components/EntryForm";
import { entryToDraft, type Entry } from "@/lib/domain";

interface Option {
  name: string;
}
interface Property {
  id: number;
  name: string;
}
export interface EntryFormOptions {
  properties: Property[];
  paymentMethods: Option[];
  channels: Option[];
  roomTypes: Option[];
  categories: { income: string[]; expense: string[] };
}

/**
 * 明細列上的「修改」鈕：點開一個蓋在畫面上的視窗，裡面是預先填好的帳目表單。
 * 多房型的訂單會把整張訂單的列一起帶進來，存檔時也是整張一起改。
 */
export default function EditEntryButton({
  rows,
  options,
  onSaved,
}: {
  rows: Entry[];
  options: EntryFormOptions;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="text-xs"
        style={{ color: "var(--text-muted)" }}
        onClick={() => setOpen(true)}
        title="修改"
      >
        修改
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "2rem 1rem",
            overflowY: "auto",
          }}
        >
          {/* 點視窗裡面不該把視窗關掉 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="card p-4"
            style={{ width: "100%", maxWidth: 460, textAlign: "left" }}
          >
            <h2 className="font-semibold mb-3">修改帳目</h2>
            <EntryForm
              {...options}
              initial={entryToDraft(rows)}
              onSaved={onSaved}
              onDone={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
