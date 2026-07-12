// =============================================================
// 領域邏輯：型別、統計計算、格式化
// 這裡的 summarize() 為純函式（相同輸入必得相同輸出），
// 是整個儀表板的計算核心，容易單獨測試與維護。
// =============================================================

export type Direction = "income" | "expense";

export interface Entry {
  id: string;
  property_id: number | null; // 屬於哪一間民宿
  entry_date: string; // YYYY-MM-DD
  direction: Direction;
  category: string;
  amount: number;
  payment_method: string | null; // 收款方式（主要金額）
  deposit: number | null; // 訂金（收入用，預設 0）
  deposit_payment_method: string | null; // 訂金的收款方式
  channel: string | null;
  guest_note: string | null;
  rooms: number | null;
  room_type: string | null;
  nights: number | null;
  room_nights: number | null;
  handler: string | null;
  memo: string | null;
}

export interface RankRow {
  name: string;
  count: number;
  total: number;
  share: number; // 0~1
}

export interface RoomTypeRow {
  name: string;
  bookings: number;
  roomNights: number;
  share: number; // 0~1
}

export interface MonthlySummary {
  addition: number; // 加項（收入合計，含訂金）
  deduction: number; // 減項（支出合計）
  profit: number; // 當月損益
  byChannel: RankRow[]; // 通路統計（依金額排序）
  byExpense: RankRow[]; // 支出結構（依金額排序，含自動清潔費）
  byPayment: RankRow[]; // 各收款方式的收入（含訂金；供對帳 / 圓餅圖）
  byPaymentExpense: RankRow[]; // 各收款方式的支出（供對帳 / 圓餅圖）
  byHandler: RankRow[]; // 各經手人的收入（含訂金；供圓餅圖）
  byHandlerExpense: RankRow[]; // 各經手人的支出（供圓餅圖）
  byRoomType: RoomTypeRow[]; // 房型間數統計
  totalRoomNights: number; // 總間數
  bookings: number; // 住宿筆數
  occupancy: number; // 住宿率 0~1
  capacity: number; // 可售房間夜 = 房間總數 × 天數
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 硬規則：清潔費 = 住宿筆數 × 此金額（自動計算，不由人工輸入）
export const CLEANING_FEE_PER_STAY = 300;
const CLEANING = "清潔費";

/** 依金額分組成排行（給收款方式圓餅用）。fill 負責把每筆金額餵進 add()。 */
function groupPay(
  fill: (add: (method: string | null, amt: number) => void) => void,
  denom: number,
): RankRow[] {
  const map = new Map<string, { count: number; total: number }>();
  fill((method, amt) => {
    if (amt <= 0) return;
    const k = method || "未指定";
    const cur = map.get(k) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += amt;
    map.set(k, cur);
  });
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, share: denom ? v.total / denom : 0 }))
    .sort((a, b) => b.total - a.total);
}

function rank(
  rows: Entry[],
  key: (e: Entry) => string,
  value: (e: Entry) => number,
  denom: number,
): RankRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const e of rows) {
    const k = key(e) || "未指定";
    const cur = map.get(k) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += value(e);
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, share: denom ? v.total / denom : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 依「某個月的帳目」計算所有儀表板指標。
 * @param entries 該月所有帳目
 * @param totalRooms 民宿可售房間總數（住宿率分母用）
 * @param daysInMonth 當月天數
 */
export function summarize(
  entries: Entry[],
  totalRooms: number,
  daysInMonth: number,
): MonthlySummary {
  const income = entries.filter((e) => e.direction === "income");
  const allExpense = entries.filter((e) => e.direction === "expense");

  // 一筆收入的總額 = 主要金額 + 訂金
  const incomeAmt = (e: Entry) => e.amount + (e.deposit ?? 0);
  const addition = sum(income.map(incomeAmt));

  // 住宿相關先算（清潔費硬規則要用到「住宿筆數」）
  const stays = income.filter(
    (e) => e.category === "住宿費" && (e.rooms ?? 0) > 0,
  );
  const bookings = stays.length;
  const roomNightsOf = (e: Entry) =>
    e.room_nights ?? (e.rooms ?? 0) * (e.nights ?? 0);
  const totalRoomNights = sum(stays.map(roomNightsOf));

  const rtMap = new Map<string, { bookings: number; roomNights: number }>();
  for (const e of stays) {
    const k = e.room_type ?? "未指定";
    const cur = rtMap.get(k) ?? { bookings: 0, roomNights: 0 };
    cur.bookings += 1;
    cur.roomNights += roomNightsOf(e);
    rtMap.set(k, cur);
  }
  const byRoomType: RoomTypeRow[] = [...rtMap.entries()]
    .map(([name, v]) => ({
      name,
      ...v,
      share: totalRoomNights ? v.roomNights / totalRoomNights : 0,
    }))
    .sort((a, b) => b.roomNights - a.roomNights);

  const capacity = totalRooms * daysInMonth;
  const occupancy = capacity ? totalRoomNights / capacity : 0;

  // 硬規則：清潔費 = 住宿筆數 × 300（自動算，人工輸入的清潔費一律忽略以免重複）
  const cleaningFee = bookings * CLEANING_FEE_PER_STAY;
  const manualExpense = allExpense.filter((e) => e.category !== CLEANING);
  const deduction = sum(manualExpense.map((e) => e.amount)) + cleaningFee;
  const profit = addition - deduction;

  const byChannel = rank(income, (e) => e.channel ?? "未指定", incomeAmt, addition);

  // 支出結構：人工科目 + 自動清潔費
  const byExpense = [
    ...rank(manualExpense, (e) => e.category, (e) => e.amount, deduction),
    ...(cleaningFee > 0
      ? [
          {
            name: CLEANING,
            count: bookings,
            total: cleaningFee,
            share: deduction ? cleaningFee / deduction : 0,
          },
        ]
      : []),
  ].sort((a, b) => b.total - a.total);

  // 各收款方式的收入（主要金額 + 訂金各自歸帳）
  const byPayment = groupPay((add) => {
    for (const e of income) {
      add(e.payment_method, e.amount);
      add(e.deposit_payment_method, e.deposit ?? 0);
    }
  }, addition);

  // 各收款方式的支出（清潔費為自動計算、無收款方式，不列入）
  const byPaymentExpense = groupPay((add) => {
    for (const e of manualExpense) add(e.payment_method, e.amount);
  }, deduction);

  // 各經手人的收入 / 支出（訂金與主要金額同屬一位經手人；清潔費自動計算、無經手人）
  const byHandler = groupPay((add) => {
    for (const e of income) add(e.handler, incomeAmt(e));
  }, addition);
  const byHandlerExpense = groupPay((add) => {
    for (const e of manualExpense) add(e.handler, e.amount);
  }, deduction);

  return {
    addition,
    deduction,
    profit,
    byChannel,
    byExpense,
    byPayment,
    byPaymentExpense,
    byHandler,
    byHandlerExpense,
    byRoomType,
    totalRoomNights,
    bookings,
    occupancy,
    capacity,
  };
}

/**
 * 一段期間的淨收支（收入−支出），套用清潔費硬規則。
 * 給「年度各月淨收支」長條圖使用，確保與儀表板損益一致。
 */
export function periodNet(entries: Entry[]): number {
  const income = entries.filter((e) => e.direction === "income");
  const addition = sum(income.map((e) => e.amount + (e.deposit ?? 0)));
  const bookings = income.filter(
    (e) => e.category === "住宿費" && (e.rooms ?? 0) > 0,
  ).length;
  const manualExpense = entries.filter(
    (e) => e.direction === "expense" && e.category !== CLEANING,
  );
  const deduction =
    sum(manualExpense.map((e) => e.amount)) + bookings * CLEANING_FEE_PER_STAY;
  return addition - deduction;
}

/**
 * 各收款方式的淨收支（該方式的收入 − 該方式的支出，可正可負）。
 * 清潔費為自動計算、無實際收款方式，不列入。
 */
export function paymentNet(entries: Entry[]): { name: string; net: number }[] {
  const map = new Map<string, number>();
  const add = (method: string | null, amt: number) => {
    if (!amt) return;
    const k = method || "未指定";
    map.set(k, (map.get(k) ?? 0) + amt);
  };
  for (const e of entries) {
    if (e.direction === "income") {
      add(e.payment_method, e.amount);
      add(e.deposit_payment_method, e.deposit ?? 0);
    } else if (e.category !== CLEANING) {
      add(e.payment_method, -e.amount);
    }
  }
  return [...map.entries()]
    .map(([name, net]) => ({ name, net }))
    .sort((a, b) => b.net - a.net);
}

/**
 * 各經手人的淨收支（該人的收入 − 該人的支出，可正可負）。
 * 訂金與主要金額同屬一位經手人；清潔費為自動計算、無經手人，不列入。
 */
export function handlerNet(entries: Entry[]): { name: string; net: number }[] {
  const map = new Map<string, number>();
  const add = (handler: string | null, amt: number) => {
    if (!amt) return;
    const k = handler || "未指定";
    map.set(k, (map.get(k) ?? 0) + amt);
  };
  for (const e of entries) {
    if (e.direction === "income") {
      add(e.handler, e.amount + (e.deposit ?? 0));
    } else if (e.category !== CLEANING) {
      add(e.handler, -e.amount);
    }
  }
  return [...map.entries()]
    .map(([name, net]) => ({ name, net }))
    .sort((a, b) => b.net - a.net);
}

/** 把一年的帳目分成 12 個月，各自算淨收支（給年度長條圖）。 */
export function monthlyNetSeries(
  yearEntries: Entry[],
): { month: number; profit: number }[] {
  const buckets: Entry[][] = Array.from({ length: 12 }, () => []);
  for (const e of yearEntries) {
    const m = Number(e.entry_date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) buckets[m].push(e);
  }
  return buckets.map((es, i) => ({ month: i + 1, profit: periodNet(es) }));
}

// ---------- 格式化 ----------
export const ntd = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);

export const num = (n: number) =>
  new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n);

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

// ---------- 月份工具 ----------
/** 取得 YYYY-MM 的起訖日期與天數（以本地時間計算，避免時區位移）。 */
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const days = new Date(y, m, 0).getDate(); // m 為 1-based → 下個月第 0 天 = 當月最後一天
  const end = `${ym}-${String(days).padStart(2, "0")}`;
  return { start, end, days };
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- 期間（報表查詢範圍）----------
export interface Period {
  key: string; // 對應下拉選項；讓 UI 記住選了哪個
  label: string; // 顯示用，例如「2026年7月」「2026年 至今」
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  days: number; // 天數（住宿率分母）
  trendYear: number; // 年度各月長條圖要顯示哪一年
}

/** 期間下拉的預設選項（順序即顯示順序）。 */
export const PERIOD_PRESETS = [
  { key: "this-month", label: "本月" },
  { key: "last-month", label: "上月" },
  { key: "ytd", label: "今年至今" },
  { key: "last-year", label: "去年整年" },
  { key: "month", label: "指定月份…" },
] as const;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function daysInclusive(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/** 把「期間 key（＋指定月份／年份）」換算成實際起訖日期。以今天為基準。 */
export function resolvePeriod(key: string, month?: string, year?: string): Period {
  const now = new Date();
  const y = now.getFullYear();

  const monthPeriod = (ym: string, presetKey: string): Period => {
    const { start, end, days } = monthRange(ym);
    return {
      key: presetKey,
      label: `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`,
      start,
      end,
      days,
      trendYear: Number(ym.slice(0, 4)),
    };
  };

  const yearPeriod = (yy: number): Period => {
    const start = `${yy}-01-01`;
    const end = `${yy}-12-31`;
    return { key: "year", label: `${yy}年 整年`, start, end, days: daysInclusive(start, end), trendYear: yy };
  };

  switch (key) {
    case "year": {
      const yy = Number(year) || y;
      // 今年 → 今年 1/1 ~ 今天（YTD）；歷史年份 → 該年整年 1/1 ~ 12/31
      if (yy === y) {
        const start = `${yy}-01-01`;
        const end = ymd(now);
        return { key: "year", label: `${yy}年 至今`, start, end, days: daysInclusive(start, end), trendYear: yy };
      }
      return yearPeriod(yy);
    }
    case "last-month": {
      const d = new Date(y, now.getMonth() - 1, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return monthPeriod(ym, "last-month");
    }
    case "ytd": {
      const start = `${y}-01-01`;
      const end = ymd(now);
      return { key, label: `${y}年 至今`, start, end, days: daysInclusive(start, end), trendYear: y };
    }
    case "last-year":
      return yearPeriod(y - 1);
    case "month":
      return monthPeriod(month ?? currentMonth(), "month");
    case "this-month":
    default:
      return monthPeriod(currentMonth(), "this-month");
  }
}
