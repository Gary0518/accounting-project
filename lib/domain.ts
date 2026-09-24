// =============================================================
// 領域邏輯：型別、統計計算、格式化
// 這裡的 summarize() 為純函式（相同輸入必得相同輸出），
// 是整個儀表板的計算核心，容易單獨測試與維護。
// =============================================================

export type Direction = "income" | "expense";

/** 最近帳目「科目篩選」的哨兵值：選了就依收支方向篩，而不是依單一科目 */
export const DIRECTION_FILTER = {
  income: "@income",
  expense: "@expense",
} as const;

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
  // 同一張訂單（多房型會拆成多列）共用；null = 這列自成一張訂單（舊資料與匯入的帳）
  booking_id: string | null;
  handler: string | null;
  memo: string | null;
  created_by?: string | null; // 建立人員（建這筆帳的帳號 ID）
}

/** 明細「建立人員」要顯示的名字（entries 只存帳號 id，名字要另外查）。 */
export interface Creator {
  id: string;
  /** 管理頁設定的中文名字；沒設就退而用 email（總之不要把 uuid 給人看） */
  name: string;
}

/** 「最近帳目」的一頁（loadRecentEntries 的回傳值）。 */
export interface RecentEntriesPage {
  rows: Entry[];
  /** 下一頁要從第幾列開始（補完訂單時會多吃幾列，不一定是 offset + 一頁列數） */
  nextOffset: number;
  hasMore: boolean;
}

/** 修改帳目時，表單要用的初始值（由一張訂單的那幾列攤平而來）。 */
export interface EntryDraft {
  bookingKey: string; // booking_id ?? id，送回後端指定要改哪一張訂單
  property_id: string;
  entry_date: string;
  direction: Direction;
  category: string;
  amount: string;
  payment_method: string;
  deposit: string;
  deposit_payment_method: string;
  channel: string;
  guest_note: string;
  nights: string;
  memo: string;
  rooms: { room_type: string; rooms: string }[];
}

/**
 * 把一張訂單（多房型時是好幾列）攤平成表單初始值。
 * rows[0] 必須是帶金額的那一列——金額、訂金、通路等訂單層級的欄位只記在那裡。
 */
export function entryToDraft(rows: Entry[]): EntryDraft {
  const head = rows[0];
  const str = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    // 單列的帳沒有 booking_id，就用它自己的 id 當識別
    bookingKey: head.booking_id ?? head.id,
    property_id: str(head.property_id),
    entry_date: head.entry_date,
    direction: head.direction,
    category: head.category,
    amount: str(head.amount),
    payment_method: str(head.payment_method),
    // 訂金 0 在表單上要顯示成空的（欄位本來就寫「沒有就留空」）
    deposit: (head.deposit ?? 0) > 0 ? str(head.deposit) : "",
    deposit_payment_method: str(head.deposit_payment_method),
    channel: str(head.channel),
    guest_note: str(head.guest_note),
    nights: str(head.nights),
    memo: str(head.memo),
    // 沒填房間數的列不是房型資料，不要帶進勾選狀態
    rooms: rows
      .filter((r) => (r.rooms ?? 0) > 0)
      .map((r) => ({ room_type: str(r.room_type), rooms: str(r.rooms) })),
  };
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
  byExpense: RankRow[]; // 支出結構（依金額排序，清潔費就是其中一個科目）
  byPayment: RankRow[]; // 各收款方式的收入（含訂金；供對帳 / 圓餅圖）
  byPaymentExpense: RankRow[]; // 各收款方式的支出（供對帳 / 圓餅圖）
  byHandler: RankRow[]; // 各經手人的收入（含訂金；供圓餅圖）
  byHandlerExpense: RankRow[]; // 各經手人的支出（供圓餅圖）
  byRoomType: RoomTypeRow[]; // 房型間數統計
  totalRoomNights: number; // 總間數
  bookings: number; // 住宿筆數（訂單數：多房型的訂單有多列，只算一筆）
  cleaningRooms: number; // 清潔房間數 = 清潔費金額 ÷ 300（當月底還沒結算前是 0）
  occupancy: number; // 住宿率 0~1
  capacity: number; // 可售房間夜 = 房間總數 × 天數
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 清潔費 = 房間數 × 300，每間房打掃一次，與住幾晚無關。
//
// 這裡不再計算清潔費 —— 它已經是資料庫裡真的一筆帳目了（每月底由排程產生，
// 見 supabase/migration_cleaning_fee_entries.sql），跟其他支出一樣被加總，
// 帳目明細與統計數字因此對得起來。
//
// 以下常數只剩「設定頁的說明文字」在用；真正決定金額與歸屬的是那支 SQL 函式，
// 要改金額或改記在誰頭上，兩邊都要改。
export const CLEANING_FEE_PER_ROOM = 300;
/** 記在誰頭上：壹樓文旅一組，其他民宿一組（見 migration_cleaning_by_property.sql）。 */
export const CLEANING_BOOKING = {
  /** 民宿名稱就是「壹樓文旅」那間 */
  yilou: { handler: "陳怡安", payment: "匯款（永豐-怡安）" },
  /** 其他所有民宿 */
  other: { handler: "黃志剛", payment: "匯款（兆豐-志剛）" },
} as const;

/** 住宿列：有填房間數的住宿費收入（多房型的訂單會有多列）。 */
const staysOf = (entries: Entry[]) =>
  entries.filter(
    (e) =>
      e.direction === "income" &&
      e.category === "住宿費" &&
      (e.rooms ?? 0) > 0,
  );

/**
 * 住宿筆數（訂單數）：同一張訂單就算拆成多列（多房型）也只算一筆。
 * 舊資料沒有 booking_id，用 id 當替身 → 每列各自一筆，行為與升級前相同。
 */
const countBookings = (stays: Entry[]) =>
  new Set(stays.map((e) => e.booking_id ?? e.id)).size;

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
    // 金額 0 的列不計入筆數：多房型訂單的第二列起金額掛 0，
    // 照算會讓通路 / 科目的「筆數」隨房型數量虛增（與 groupPay 同一原則）。
    const v = value(e);
    if (v <= 0) continue;
    const k = key(e) || "未指定";
    const cur = map.get(k) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += v;
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
  // 清潔費現在也是一般的支出帳目，不需要再特別處理
  const expense = entries.filter((e) => e.direction === "expense");

  // 一筆收入的總額 = 主要金額 + 訂金
  const incomeAmt = (e: Entry) => e.amount + (e.deposit ?? 0);
  const addition = sum(income.map(incomeAmt));

  const stays = staysOf(income);
  // 筆數 = 訂單數（多房型的訂單有多列，只算一筆）
  const bookings = countBookings(stays);
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

  const deduction = sum(expense.map((e) => e.amount));
  const profit = addition - deduction;

  // 清潔房間數：直接從帳上那筆清潔費反推（金額 ÷ 300），數字才跟支出結構對得起來。
  // 不用住宿列的 rooms 加總，因為清潔費是每月底排程產生的，當月還沒產生時這裡就該是 0。
  const cleaningRooms = Math.round(
    sum(expense.filter((e) => e.category === "清潔費").map((e) => e.amount)) /
      CLEANING_FEE_PER_ROOM,
  );

  const byChannel = rank(income, (e) => e.channel ?? "未指定", incomeAmt, addition);

  const byExpense = rank(expense, (e) => e.category, (e) => e.amount, deduction);

  // 各收款方式的收入（主要金額 + 訂金各自歸帳）
  const byPayment = groupPay((add) => {
    for (const e of income) {
      add(e.payment_method, e.amount);
      add(e.deposit_payment_method, e.deposit ?? 0);
    }
  }, addition);

  const byPaymentExpense = groupPay((add) => {
    for (const e of expense) add(e.payment_method, e.amount);
  }, deduction);

  // 訂金與主要金額同屬一位經手人
  const byHandler = groupPay((add) => {
    for (const e of income) add(e.handler, incomeAmt(e));
  }, addition);
  const byHandlerExpense = groupPay((add) => {
    for (const e of expense) add(e.handler, e.amount);
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
    cleaningRooms,
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
  const deduction = sum(
    entries.filter((e) => e.direction === "expense").map((e) => e.amount),
  );
  return addition - deduction;
}

/**
 * 各收款方式的淨收支（該方式的收入 − 該方式的支出，可正可負）。
 * 清潔費是資料庫裡真的一筆支出，會跟著它自己的收款方式一起算進來。
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
    } else {
      add(e.payment_method, -e.amount);
    }
  }
  return [...map.entries()]
    .map(([name, net]) => ({ name, net }))
    .sort((a, b) => b.net - a.net);
}

/**
 * 各經手人的淨收支（該人的收入 − 該人的支出，可正可負）。
 * 訂金與主要金額同屬一位經手人。
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
    } else {
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
