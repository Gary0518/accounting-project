"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createEntry, updateEntry } from "@/app/actions";
import { type EntryDraft } from "@/lib/domain";

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
  propertyId,
  onPropertyChange,
  onSaved,
  initial,
  onDone,
  paymentMethods,
  channels,
  roomTypes,
  categories,
}: {
  properties: Property[];
  /** 新增模式：目前選的民宿（由外層保管，右邊的最近帳目要跟著它走） */
  propertyId?: string;
  onPropertyChange?: (v: string) => void;
  /** 存檔成功後通知外層重新載入明細 */
  onSaved?: () => void;
  /** 有值 = 修改模式：欄位帶入這張訂單原本的內容 */
  initial?: EntryDraft;
  /** 修改模式：存好或取消後關掉視窗 */
  onDone?: () => void;
  paymentMethods: Option[];
  channels: Option[];
  roomTypes: Option[];
  categories: Categories;
}) {
  const editing = !!initial;
  const router = useRouter();
  const [direction, setDirection] = useState<"income" | "expense">(initial?.direction ?? "income");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 勾起來的房型 → 間數。沒勾的房型不在這裡，也不會送出。
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial?.rooms ?? []).map((r) => [r.room_type || "__none__", r.rooms]),
    ),
  );
  // 修改模式的民宿由表單自己管；新增模式交給外層（要記住上次選的那間）
  const [editProperty, setEditProperty] = useState(initial?.property_id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const propertyRef = useRef<HTMLSelectElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const cats = categories[direction];

  const currentProperty = editing ? editProperty : (propertyId ?? "");
  const changeProperty = (v: string) =>
    editing ? setEditProperty(v) : onPropertyChange?.(v);

  // 「未指定」也列一格：以前房型下拉有這個選項，有人只記間數不記房型，
  // 拿掉的話那種訂單就算不出清潔費了。
  const roomOptions = [
    ...roomTypes.map((r) => ({ key: r.name, name: r.name, label: r.name })),
    { key: "__none__", name: "", label: "未指定房型" },
  ];

  const toggleRoomType = (key: string) =>
    setPicked((p) => {
      if (key in p) {
        const next = { ...p };
        delete next[key];
        return next;
      }
      return { ...p, [key]: "1" }; // 勾了預設 1 間，最常見的情況少打一個字
    });
  const setRoomCount = (key: string, v: string) =>
    setPicked((p) => ({ ...p, [key]: v }));

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      if (editing) {
        await updateEntry(formData);
        onSaved?.();
        router.refresh();
        onDone?.();
        return; // 修改完視窗就關了，不用清空欄位
      }
      await createEntry(formData);
      formRef.current?.reset();
      // reset() 會把民宿打回選單第一項，但 React 這邊的值沒變、不會重畫，
      // 所以要自己把記住的民宿寫回去，不然存完一筆就跳回第一間。
      if (propertyRef.current) propertyRef.current.value = currentProperty;
      // 房型的勾選狀態在 React 這邊，reset() 清不到，要自己清
      setPicked({});
      onSaved?.();
      router.refresh();
    } catch {
      // 不外洩資料庫內部訊息，只給使用者可行動的提示
      setError(editing ? "修改失敗，請確認欄位後再試一次。" : "儲存失敗，請確認欄位後再試一次。");
    } finally {
      setPending(false);
    }
  }

  const tabStyle = (on: boolean) =>
    ({
      flex: 1,
      padding: "0.35rem",
      borderRadius: 8,
      fontWeight: 700,
      cursor: "pointer",
      border: "1px solid var(--border)",
      background: on ? "var(--series-1)" : "transparent",
      color: on ? "#fff" : "var(--text-secondary)",
    }) as const;

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className={`flex flex-col gap-2 form-compact${editing ? "" : " card p-3"}`}
    >
      {editing && <input type="hidden" name="booking_key" value={initial.bookingKey} />}
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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">民宿</label>
          <select
            name="property_id"
            required
            className="field"
            ref={propertyRef}
            value={currentProperty}
            onChange={(e) => changeProperty(e.target.value)}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">日期</label>
          <input
            type="date"
            name="entry_date"
            defaultValue={initial?.entry_date ?? today}
            required
            className="field"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{direction === "income" ? "收入來源" : "支出科目"}</label>
          <select name="category" required className="field" defaultValue={initial?.category ?? cats[0]}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">金額（{direction === "income" ? "收入" : "支出"}）</label>
          <input
            type="number"
            name="amount"
            min="0"
            step="1"
            required
            defaultValue={initial?.amount}
            className="field no-spin"
            inputMode="numeric"
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
      </div>

      {/* 支出：收款方式 + 備註 同一列，表單更矮 */}
      {direction === "expense" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">收款方式</label>
            <select
              name="payment_method"
              required
              className="field"
              defaultValue={initial?.payment_method ?? paymentMethods[0]?.name}
            >
              {paymentMethods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">備註</label>
            <input type="text" name="memo" defaultValue={initial?.memo} className="field" />
          </div>
        </div>
      )}

      {/* 收入：收款方式 + 訂金相關 + 訂房 / 房型欄位 */}
      {direction === "income" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">收款方式</label>
              <select
              name="payment_method"
              required
              className="field"
              defaultValue={initial?.payment_method ?? paymentMethods[0]?.name}
            >
                {paymentMethods.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">來源（通路）</label>
              <select name="channel" className="field" defaultValue={initial?.channel ?? ""}>
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
            className="grid grid-cols-2 gap-2 p-2 rounded-lg"
            style={{ background: "var(--bar-track)" }}
          >
            <div>
              <label className="label">訂金（沒有就留空）</label>
              <input
                type="number"
                name="deposit"
                min="0"
                step="1"
                placeholder="0"
                defaultValue={initial?.deposit}
                className="field no-spin"
                inputMode="numeric"
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
            <div>
              <label className="label">訂金收款方式</label>
              <select
                name="deposit_payment_method"
                className="field"
                defaultValue={initial?.deposit_payment_method ?? paymentMethods[0]?.name}
              >
                {paymentMethods.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">入住說明</label>
              <input
                type="text"
                name="guest_note"
                defaultValue={initial?.guest_note}
                className="field"
                placeholder="房客姓名 / 備註"
              />
            </div>
            <div>
              <label className="label">天數</label>
              <input
                type="number"
                name="nights"
                min="0"
                step="1"
                defaultValue={initial?.nights}
                className="field"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* 房型全部列出來，勾了才填間數（大床房 ×1 + 小床房 ×2 = 一張訂單兩列）。
              天數是整張訂單共用的，所以不在這裡重複填。 */}
          <div>
            <label className="label">房型 / 間數（可複選）</label>
            {/* 一個房型一列會把表單拉得很長，改成會自動換行的標籤，
                只有勾起來的才展開右邊的間數框 */}
            <div className="flex flex-wrap gap-1.5">
              {roomOptions.map(({ key, name, label }) => {
                const on = key in picked;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-1.5"
                    style={{
                      padding: on ? "0.15rem 0.3rem 0.15rem 0.5rem" : "0.25rem 0.55rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: on ? "var(--bar-track)" : "transparent",
                    }}
                  >
                    <label
                      className="flex items-center gap-1.5"
                      style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleRoomType(key)}
                        style={{ width: 15, height: 15, flex: "none", accentColor: "var(--series-1)" }}
                      />
                      <span
                        className="text-sm"
                        style={{
                          color: on ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {label}
                      </span>
                    </label>
                    {on && (
                      <>
                        {/* 勾選的房型才送出；兩個欄位同序出現，後端按順序配對 */}
                        <input type="hidden" name="room_type" value={name} />
                        <input
                          type="number"
                          name="rooms"
                          min="1"
                          step="1"
                          className="field"
                          inputMode="numeric"
                          aria-label={`${label} 的間數`}
                          value={picked[key]}
                          onChange={(e) => setRoomCount(key, e.target.value)}
                          style={{ width: 66, flex: "none", padding: "0.15rem 0.2rem 0.15rem 0.35rem" }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">備註</label>
            <input type="text" name="memo" defaultValue={initial?.memo} className="field" />
          </div>
        </>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {editing && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onDone}
            disabled={pending}
            style={{ padding: "0.45rem 1.1rem" }}
          >
            取消
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          style={{ padding: "0.45rem 1.1rem", flex: 1 }}
        >
          {pending ? "儲存中…" : editing ? "儲存修改" : "新增帳目"}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)", marginTop: "-0.15rem" }}>
        {editing
          ? "經手人維持原本記錄的人；多房型的訂單是整張一起修改。"
          : "經手人自動記錄為登入帳號，間數 = 房間數 × 天數。"}
      </p>
    </form>
  );
}
