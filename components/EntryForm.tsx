"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * 只有住宿費才有房客、天數與房間可言；租車、傭金之類的收入來源填了沒有意義
 * （也算不出間數），所以「入住人 / 天數 / 房型間數」整區反白不讓填、也不送出。
 * 用「包含」比對而不是完全相同：科目名稱是設定頁可以改的，
 * 「住宿費」與「住宿費用」都算同一類。
 */
const isLodging = (category: string) => category.includes("住宿");

/**
 * 選了這些通路，收款方式自動帶入對應的帳戶（之後仍可手動改；訂金的收款方式不帶）。
 * 沒列的通路不自動帶。比對時忽略大小寫與空白：設定頁的名稱寫法不一定一致，
 * 「expedia」「外匯入帳- Expedia」都要對得到；對應的收款方式在設定頁不存在就不帶。
 */
const CHANNEL_PAYMENT: Record<string, string> = {
  trip: "外匯入帳-TRIP",
  expedia: "外匯入帳-Expedia",
  agoda: "外匯入帳-Agoda",
  立榮: "應收旅行社",
  華信: "應收旅行社",
  樂咖: "應收旅行社",
  大玩咖: "應收旅行社",
};
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 選了這些收入來源，通路自動帶入對應的通路（之後仍可手動改）。
 * 比對方式同 CHANNEL_PAYMENT；對應的通路在設定頁不存在就不帶。
 */
const CATEGORY_CHANNEL: Record<string, string> = {
  租車費用: "金豐",
};

/** 反白（鎖住）的欄位長相：灰底灰字 + 禁止游標。 */
const lockedStyle = {
  background: "var(--bar-track)",
  color: "var(--text-muted)",
  cursor: "not-allowed",
} as const;

/** 沒填的欄位畫紅框；紅框比瀏覽器內建的提示泡泡好認，手機上也看得到。 */
const invalidStyle = (bad: boolean) =>
  bad ? { borderColor: "var(--critical)", outlineColor: "var(--critical)" } : undefined;

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
  const today = new Date().toISOString().slice(0, 10);
  const cats = categories[direction];

  // 科目與天數要互相牽動（租車 / 其他不填天數），所以這兩欄由 React 管值
  const [category, setCategory] = useState(initial?.category ?? cats[0] ?? "");
  const [nights, setNights] = useState(initial?.nights ?? "");
  const [guestNote, setGuestNote] = useState(initial?.guest_note ?? "");
  // 哪些欄位沒填好（按過送出才會有東西，不然一進來就滿江紅）
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  // 連點兩下的第二下要在 React 重畫按鈕之前就擋掉，所以用 ref 而不是 pending state
  const submitting = useRef(false);

  // 非住宿的收入來源：入住人 / 天數 / 房型間數整區鎖起來
  const stayLocked = direction === "income" && !isLodging(category);

  const currentProperty = editing ? editProperty : (propertyId ?? "");
  const changeProperty = (v: string) =>
    editing ? setEditProperty(v) : onPropertyChange?.(v);

  // 選通路 → 收款方式自動帶入對應帳戶（收款方式是非受控欄位，直接改 DOM 的值）
  const fillPaymentFromChannel = (channel: string) => {
    const target = CHANNEL_PAYMENT[norm(channel)];
    if (!target) return;
    const match = paymentMethods.find((p) => norm(p.name) === norm(target));
    const select = formRef.current?.querySelector<HTMLSelectElement>('[name="payment_method"]');
    if (match && select) select.value = match.name;
  };

  // 選收入來源 → 通路自動帶入對應通路（通路也是非受控欄位），再連動帶收款方式
  const fillChannelFromCategory = (cat: string) => {
    const target = CATEGORY_CHANNEL[norm(cat)];
    if (!target) return;
    const match = channels.find((c) => norm(c.name) === norm(target));
    const select = formRef.current?.querySelector<HTMLSelectElement>('[name="channel"]');
    if (!match || !select) return;
    select.value = match.name;
    fillPaymentFromChannel(match.name);
  };

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

  /** 勾了卻沒填（或填 0）的間數：整區紅框看不出是哪個房型，那一格自己也要紅。 */
  const roomCountBad = (v: string) =>
    !!bad.rooms && (v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 1);

  const changeDirection = (d: "income" | "expense") => {
    setDirection(d);
    // 收入與支出的科目是兩組，換邊時把科目換成新那組的第一項
    const next = categories[d][0] ?? "";
    setCategory(next);
    // 換到的科目不是住宿的話，住宿那區照樣清空（同 changeCategory）
    if (d === "expense" || !isLodging(next)) {
      setNights("");
      setGuestNote("");
      setPicked({});
    }
    setBad({});
  };

  const changeCategory = (v: string) => {
    setCategory(v);
    // 換成非住宿的科目就把住宿那區已填的內容清掉，
    // 不然欄位反白了、值卻還留著，看起來像會被記進去
    if (direction === "income" && !isLodging(v)) {
      setNights("");
      setGuestNote("");
      setPicked({});
    }
    if (direction === "income") fillChannelFromCategory(v);
  };

  /** 檢查必填欄位，回傳沒填好的欄位名。 */
  function findProblems(fd: FormData): Record<string, boolean> {
    const str = (k: string) => String(fd.get(k) ?? "").trim();
    const problems: Record<string, boolean> = {};
    if (!str("entry_date")) problems.entry_date = true;
    if (!str("category")) problems.category = true;
    if (!str("payment_method")) problems.payment_method = true;
    // 金額 0 是合法的（沖帳），空白與負數不是
    const amount = str("amount");
    if (amount === "" || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      problems.amount = true;
    }
    // 反白的欄位不送出，也不該檢查
    if (direction === "income" && !str("channel")) problems.channel = true;
    if (direction === "income" && !stayLocked) {
      if (!str("guest_note")) problems.guest_note = true;
      if (!str("nights")) problems.nights = true;
      // 房型 / 間數：至少勾一個，而且每個勾起來的都要填 ≥1 的間數。
      // 這裡讀 picked（React state）而不是 FormData：勾選的那一瞬間，
      // 隱藏的 room_type / rooms 欄位還沒被 React 畫進 DOM，FormData 會讀到舊的。
      const counts = Object.values(picked);
      if (
        !counts.length ||
        counts.some((v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 1)
      ) {
        problems.rooms = true;
      }
    }
    return problems;
  }

  // 按過送出之後，邊改邊把紅框拿掉，不用再按一次才知道補好了沒
  const recheck = () => {
    if (!attempted || !formRef.current) return;
    const problems = findProblems(new FormData(formRef.current));
    setBad(problems);
    if (!Object.keys(problems).length) setError(null);
  };

  // 房型的勾選不是一般的 DOM 欄位，表單的 onChange 當下還讀不到新值，
  // 所以等 picked 真的更新、重畫完之後再驗一次（按過送出才會有紅框）。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(recheck, [picked]);

  /** 存檔成功後清空欄位。不用 form.reset()：那會把民宿也打回第一間。 */
  function clearForm() {
    const form = formRef.current;
    if (form) {
      const set = (name: string, v = "") => {
        const el = form.elements.namedItem(name);
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = v;
      };
      set("amount");
      set("deposit");
      set("channel");
      set("memo");
      set("payment_method");
      set("deposit_payment_method");
      set("entry_date", today);
    }
    setNights("");
    setGuestNote("");
    setCategory(categories[direction][0] ?? "");
    // 房型的勾選狀態在 React 這邊，改 DOM 的值清不到
    setPicked({});
    setBad({});
    setAttempted(false);
  }

  /**
   * 自己接 submit（而不是用 <form action={...}>）：
   * form action 在動作結束後會自動把表單清空，檢查沒過就退回時會連使用者剛打的內容一起清掉。
   */
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 同一筆帳按兩次會存成兩筆，所以第二下直接不理它
    if (submitting.current) return;
    const formData = new FormData(e.currentTarget);

    setAttempted(true);
    const problems = findProblems(formData);
    if (Object.keys(problems).length) {
      setBad(problems);
      setError("紅框的欄位還沒填好。");
      // 捲到 / 聚焦第一個沒填的欄位，欄位多的時候不用自己找
      const first = Object.keys(problems)[0];
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${first}"], [data-field="${first}"]`)
        ?.focus();
      return;
    }

    submitting.current = true;
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
      // 民宿不清：接著多半是繼續記同一間的帳
      clearForm();
      onSaved?.();
      router.refresh();
    } catch {
      // 不外洩資料庫內部訊息，只給使用者可行動的提示
      setError(editing ? "修改失敗，請確認欄位後再試一次。" : "儲存失敗，請確認欄位後再試一次。");
    } finally {
      submitting.current = false;
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
      onSubmit={onSubmit}
      // 自己檢查必填（畫紅框），不要瀏覽器的提示泡泡搶先擋下送出
      noValidate
      onInput={recheck}
      onChange={recheck}
      className={`flex flex-col gap-2 form-compact${editing ? "" : " card p-3"}`}
    >
      {editing && <input type="hidden" name="booking_key" value={initial.bookingKey} />}
      {/* 收入 / 支出 切換 */}
      <div className="flex gap-2">
        <button
          type="button"
          style={tabStyle(direction === "income")}
          onClick={() => changeDirection("income")}
        >
          收入
        </button>
        <button
          type="button"
          style={tabStyle(direction === "expense")}
          onClick={() => changeDirection("expense")}
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
            aria-invalid={!!bad.entry_date}
            className="field"
            style={invalidStyle(!!bad.entry_date)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{direction === "income" ? "收入來源" : "支出科目"}</label>
          <select
            name="category"
            required
            className="field"
            value={category}
            onChange={(e) => changeCategory(e.target.value)}
            aria-invalid={!!bad.category}
            style={invalidStyle(!!bad.category)}
          >
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
            aria-invalid={!!bad.amount}
            className="field no-spin"
            inputMode="numeric"
            onWheel={(e) => e.currentTarget.blur()}
            style={invalidStyle(!!bad.amount)}
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
              // 預設空白：不選就不給存，免得整批帳都記成第一個方式
              defaultValue={initial?.payment_method ?? ""}
              aria-invalid={!!bad.payment_method}
              style={invalidStyle(!!bad.payment_method)}
            >
              <option value="">請選擇…</option>
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

      {/* 收入：通路 + 收款方式（上下兩排）+ 訂金相關 + 訂房 / 房型欄位 */}
      {direction === "income" && (
        <>
          <div className="grid gap-2">
            <div>
              <label className="label">來源（通路）</label>
              <select
                name="channel"
                required
                className="field"
                defaultValue={initial?.channel ?? ""}
                onChange={(e) => fillPaymentFromChannel(e.target.value)}
                aria-invalid={!!bad.channel}
                style={invalidStyle(!!bad.channel)}
              >
                <option value="">請選擇…</option>
                {channels.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">收款方式</label>
              <select
                name="payment_method"
                required
                className="field"
                // 預設空白：不選就不給存，免得整批帳都記成第一個方式
                defaultValue={initial?.payment_method ?? ""}
                aria-invalid={!!bad.payment_method}
                style={invalidStyle(!!bad.payment_method)}
              >
                <option value="">請選擇…</option>
                {paymentMethods.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
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
                defaultValue={initial?.deposit_payment_method ?? ""}
              >
                <option value="">請選擇…</option>
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
              <label className="label">入住人</label>
              <input
                type="text"
                name="guest_note"
                value={guestNote}
                onChange={(e) => setGuestNote(e.target.value)}
                // 非住宿的收入來源沒有房客可言：欄位反白，也不會送出
                disabled={stayLocked}
                required={!stayLocked}
                aria-invalid={!!bad.guest_note}
                className="field"
                placeholder={stayLocked ? "不需填" : "房客姓名 / 備註"}
                style={{
                  ...invalidStyle(!!bad.guest_note),
                  ...(stayLocked ? lockedStyle : null),
                }}
              />
            </div>
            <div>
              <label className="label">天數</label>
              <input
                type="number"
                name="nights"
                min="0"
                step="1"
                value={nights}
                onChange={(e) => setNights(e.target.value)}
                // 非住宿的收入來源沒有天數可言：欄位反白，也不會送出
                disabled={stayLocked}
                required={!stayLocked}
                aria-invalid={!!bad.nights}
                className="field"
                inputMode="numeric"
                placeholder={stayLocked ? "不需填" : undefined}
                style={{
                  ...invalidStyle(!!bad.nights),
                  ...(stayLocked ? lockedStyle : null),
                }}
              />
            </div>
          </div>

          {/* 房型全部列出來，勾了才填間數（大床房 ×1 + 小床房 ×2 = 一張訂單兩列）。
              天數是整張訂單共用的，所以不在這裡重複填。 */}
          <div>
            <label
              className="label"
              style={
                stayLocked
                  ? { color: "var(--text-muted)" }
                  : bad.rooms
                    ? { color: "var(--critical)" }
                    : undefined
              }
            >
              房型 / 間數（可複選）{stayLocked && "－不需填"}
            </label>
            {/* 一個房型一列會把表單拉得很長，改成會自動換行的標籤，
                只有勾起來的才展開右邊的間數框 */}
            <div
              className="flex flex-wrap gap-1.5"
              // 沒勾任何房型時要能被「捲到第一個沒填的欄位」找到（這區沒有 name 可比對）
              data-field="rooms"
              tabIndex={-1}
              style={{
                // 非住宿的收入來源算不出間數：整區反白不讓勾
                ...(stayLocked ? { opacity: 0.5, cursor: "not-allowed" } : null),
                // 一個都沒勾（或間數沒填）就整區畫紅框，跟其他必填欄位一致
                ...(bad.rooms
                  ? {
                      border: "1px solid var(--critical)",
                      borderRadius: 8,
                      padding: "0.35rem",
                      outline: "none",
                    }
                  : null),
              }}
            >
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
                      background: stayLocked || on ? "var(--bar-track)" : "transparent",
                    }}
                  >
                    <label
                      className="flex items-center gap-1.5"
                      style={{
                        cursor: stayLocked ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={stayLocked}
                        onChange={() => toggleRoomType(key)}
                        style={{ width: 15, height: 15, flex: "none", accentColor: "var(--series-1)" }}
                      />
                      <span
                        className="text-sm"
                        style={{
                          color: stayLocked
                            ? "var(--text-muted)"
                            : on
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
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
                          aria-invalid={roomCountBad(picked[key])}
                          style={{
                            width: 66,
                            flex: "none",
                            padding: "0.15rem 0.2rem 0.15rem 0.35rem",
                            ...invalidStyle(roomCountBad(picked[key])),
                          }}
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
          // 存檔中整顆反白：不然看不出有沒有按到，會再按一次變成兩筆一樣的帳
          style={{
            padding: "0.45rem 1.1rem",
            flex: 1,
            opacity: pending ? 0.5 : 1,
            cursor: pending ? "not-allowed" : "pointer",
          }}
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
