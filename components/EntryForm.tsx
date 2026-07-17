"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEntry } from "@/app/actions";

interface Option {
  name: string;
}
interface Property {
  id: number;
  name: string;
}
interface Categories {
  income: string[];
  expense: string[];
}

export default function EntryForm({
  properties,
  paymentMethods,
  channels,
  roomTypes,
  categories,
}: {
  properties: Property[];
  paymentMethods: Option[];
  channels: Option[];
  roomTypes: Option[];
  categories: Categories;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"income" | "expense">("income");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const cats = categories[direction];

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createEntry(formData);
      const form = document.getElementById("entry-form") as HTMLFormElement;
      form?.reset();
      router.refresh();
    } catch {
      // 不外洩資料庫內部訊息，只給使用者可行動的提示
      setError("儲存失敗，請確認欄位後再試一次。");
    } finally {
      setPending(false);
    }
  }

  const tabStyle = (on: boolean) =>
    ({
      flex: 1,
      padding: "0.55rem",
      borderRadius: 10,
      fontWeight: 700,
      cursor: "pointer",
      border: "1px solid var(--border)",
      background: on ? "var(--series-1)" : "transparent",
      color: on ? "#fff" : "var(--text-secondary)",
    }) as const;

  return (
    <form id="entry-form" action={onSubmit} className="card p-4 flex flex-col gap-3">
      {/* 收入 / 支出 切換 */}
      <div className="flex gap-2">
        <button
          type="button"
          style={tabStyle(direction === "income")}
          onClick={() => setDirection("income")}
        >
          收入
        </button>
        <button
          type="button"
          style={tabStyle(direction === "expense")}
          onClick={() => setDirection("expense")}
        >
          支出
        </button>
      </div>
      <input type="hidden" name="direction" value={direction} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">民宿</label>
          <select name="property_id" required className="field" defaultValue={properties[0]?.id}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">日期</label>
          <input type="date" name="entry_date" defaultValue={today} required className="field" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{direction === "income" ? "收入來源" : "支出科目"}</label>
          <select name="category" required className="field" defaultValue={cats[0]}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">金額（{direction === "income" ? "收入" : "支出"}）</label>
          <input type="number" name="amount" min="0" step="1" required className="field" inputMode="numeric" />
        </div>
      </div>

      {/* 支出：收款方式 + 備註 同一列，表單更矮 */}
      {direction === "expense" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">收款方式</label>
            <select name="payment_method" required className="field" defaultValue={paymentMethods[0]?.name}>
              {paymentMethods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">備註</label>
            <input type="text" name="memo" className="field" />
          </div>
        </div>
      )}

      {/* 收入：收款方式 + 訂金相關 + 訂房 / 房型欄位 */}
      {direction === "income" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">收款方式</label>
              <select name="payment_method" required className="field" defaultValue={paymentMethods[0]?.name}>
                {paymentMethods.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">來源（通路）</label>
              <select name="channel" className="field" defaultValue="">
                <option value="">未指定</option>
                {channels.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 訂金（預設 0，並有自己的收款方式）*/}
          <div
            className="grid grid-cols-2 gap-3 p-3 rounded-xl"
            style={{ background: "var(--bar-track)" }}
          >
            <div>
              <label className="label">訂金（沒有就留空）</label>
              <input type="number" name="deposit" min="0" step="1" placeholder="0" className="field" inputMode="numeric" />
            </div>
            <div>
              <label className="label">訂金收款方式</label>
              <select name="deposit_payment_method" className="field" defaultValue={paymentMethods[0]?.name}>
                {paymentMethods.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">房型</label>
              <select name="room_type" className="field" defaultValue="">
                <option value="">未指定</option>
                {roomTypes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">房間數</label>
                <input type="number" name="rooms" min="0" step="1" className="field" inputMode="numeric" />
              </div>
              <div>
                <label className="label">天數</label>
                <input type="number" name="nights" min="0" step="1" className="field" inputMode="numeric" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">入住說明</label>
              <input type="text" name="guest_note" className="field" placeholder="房客姓名 / 備註" />
            </div>
            <div>
              <label className="label">備註</label>
              <input type="text" name="memo" className="field" />
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "儲存中…" : "新增帳目"}
      </button>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        經手人會自動記錄為目前登入的帳號；間數（房間數 × 天數）由系統自動計算，儀表板會即時更新給所有同事。
      </p>
    </form>
  );
}
