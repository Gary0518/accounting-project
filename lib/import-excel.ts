// =============================================================
// 解析老闆的舊帳 Excel（每個月一張工作表的那種格式）。
//
// 為什麼用「找標題列」而不是寫死行號：實際檔案裡三個月的版面都不一樣
// （資料從第 4 列或第 7 列開始、費用區從第 45 / 49 / 51 列開始），
// 硬編行號一定會壞。這裡改成掃前幾列找到「日期 / 收入 / 支出」那一列當標題，
// 之後只要「A 欄是日期」的列就當一筆資料，統計區沒有日期會自然被跳過。
//
// 這支檔案是純函式（只吃 Buffer、吐結構），不碰資料庫，方便單獨測試。
// =============================================================

import ExcelJS from "exceljs";
import type { Direction } from "./domain";

/** 從 Excel 解出來的一筆帳（handler / channel 等仍是 Excel 原始字串）。 */
export interface ImportRow {
  sheet: string;
  excelRow: number; // 原始列號，預覽時對照用
  entry_date: string; // YYYY-MM-DD
  direction: Direction;
  category: string;
  amount: number;
  channel: string | null;
  guest_note: string | null;
  rooms: number | null;
  room_type: string | null;
  nights: number | null;
  handler: string | null; // Excel 的「經手」原始值，例如「剛」「安」
  memo: string | null;
}

export interface SkippedRow {
  sheet: string;
  excelRow: number;
  reason: string;
}

export interface ParsedSheet {
  name: string;
  ledger: boolean; // 是不是帳目工作表
  income: number; // 收入合計
  expense: number; // 支出合計（不含系統自動算的清潔費）
  rows: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface ParseResult {
  sheets: ParsedSheet[];
  rows: ImportRow[];
  skipped: SkippedRow[];
}

/** 解析完回給前端的預覽（rows 的通路 / 房型已正規化成選單裡的正式寫法）。 */
export interface ImportPreview {
  sheets: ParsedSheet[];
  rows: ImportRow[];
  skipped: SkippedRow[];
  handlers: string[]; // Excel 出現過的經手人縮寫，等使用者對應
  profiles: { name: string }[]; // 系統裡可選的經手人
  newChannels: string[]; // 不在下拉選單裡的通路
  newRoomTypes: string[];
  newCategories: { name: string; direction: Direction }[];
  existing: { count: number; start: string; end: string } | null; // 該期間已有帳目
  refunds: number; // 記成「支出」的住宿費筆數（老闆用這種方式記退款）
}

/** 前端按下「確認匯入」時送回伺服器的東西。 */
export interface CommitPayload {
  propertyId: number;
  sheets: string[]; // 只匯入這些工作表
  rows: ImportRow[];
  handlerMap: Record<string, string>; // 「剛」→「黃志剛」；空字串代表留空
  addOptions: boolean; // 是否把新的通路 / 房型 / 科目一併加進下拉選單
}

/**
 * 不分大小寫對到選單裡的正式寫法：Excel 的 'trip' / 'Expedia' 會被正規化成
 * 選單裡的 'TRIP' / 'expedia'，否則同一個通路會在報表上裂成兩塊。
 * 對不到就原樣保留（等使用者決定要不要加進選單）。
 */
export function canonical(value: string | null, options: string[]): string | null {
  if (!value) return null;
  const hit = options.find((o) => o.toLowerCase() === value.toLowerCase());
  return hit ?? value;
}

// 清潔費由系統自動計算（住宿筆數/房間數 × 300），匯入會重複記帳，所以略過。
const CLEANING = "清潔費";

// ---------- 儲存格取值 ----------

/** 把 exceljs 的各種 CellValue 拆成原始值：公式取「快取結果」，錯誤值（#REF!）當空。 */
function unwrap(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("error" in o) return null; // #REF! / #DIV/0!
    if ("result" in o) return unwrap(o.result as ExcelJS.CellValue); // 公式 → 快取結果
    if ("richText" in o) {
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    }
    if ("text" in o) return o.text; // 超連結
  }
  return v;
}

function asText(v: ExcelJS.CellValue): string | null {
  const r = unwrap(v);
  if (r === null || r === undefined) return null;
  if (r instanceof Date) return null;
  const s = String(r).trim();
  return s === "" ? null : s;
}

function asNumber(v: ExcelJS.CellValue): number | null {
  const r = unwrap(v);
  if (typeof r === "number") return Number.isFinite(r) ? r : null;
  if (typeof r === "string" && r.trim() !== "") {
    const n = Number(r.replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asInt(v: ExcelJS.CellValue): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.round(n);
}

/** 正整數才回傳值，否則 null。用來辨認「續列」，順便擋掉統計區的小數（比例）。 */
function asPosInt(v: ExcelJS.CellValue): number | null {
  const n = asNumber(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

/** 以本地時間輸出 YYYY-MM-DD（用 UTC 會把 00:00 的日期倒退一天）。 */
function asDate(v: ExcelJS.CellValue): string | null {
  const r = unwrap(v);
  if (!(r instanceof Date) || Number.isNaN(r.getTime())) return null;
  const y = r.getFullYear();
  const m = String(r.getMonth() + 1).padStart(2, "0");
  const d = String(r.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------- 欄位定位 ----------

interface ColMap {
  headerRow: number;
  date: number;
  category: number;
  income: number;
  expense: number;
  channel: number | null;
  guest: number | null;
  rooms: number | null;
  roomType: number | null;
  nights: number | null;
  handler: number | null;
  memo: number | null;
}

/**
 * 掃前 20 列找標題列：同時出現「日期」「收入」「支出」才算數。
 * 科目那一欄的標題是「請選擇」（下拉提示字），所以改用「日期的下一欄」定位；
 * 備註欄在某些月份沒有標題，用「經手的下一欄」定位。
 */
function findColumns(ws: ExcelJS.Worksheet): ColMap | null {
  const limit = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= limit; r++) {
    const at = new Map<string, number>();
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const t = asText(cell.value);
      if (t && !at.has(t)) at.set(t, col);
    });

    const date = at.get("日期");
    const income = at.get("收入");
    const expense = at.get("支出");
    if (!date || !income || !expense) continue;

    const handler = at.get("經手") ?? null;
    return {
      headerRow: r,
      date,
      category: date + 1,
      income,
      expense,
      channel: at.get("來源") ?? null,
      guest: at.get("入住說明") ?? null,
      rooms: at.get("房間數") ?? null,
      roomType: at.get("房型") ?? null,
      nights: at.get("天") ?? null,
      handler,
      memo: handler ? handler + 1 : null,
    };
  }
  return null;
}

// ---------- 主流程 ----------

/** 續列要接回去的那一筆住宿（同一筆訂房拆成多列時用）。 */
interface StayRef {
  date: string;
  category: string;
  channel: string | null;
  guest: string | null;
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheets: ParsedSheet[] = [];
  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];

  for (const ws of wb.worksheets) {
    const cols = findColumns(ws);
    if (!cols) {
      sheets.push({
        name: ws.name,
        ledger: false,
        income: 0,
        expense: 0,
        rows: 0,
        minDate: null,
        maxDate: null,
      });
      continue;
    }

    const before = rows.length;
    let income = 0;
    let expense = 0;
    let minDate: string | null = null;
    let maxDate: string | null = null;

    const cell = (r: number, c: number | null) =>
      c === null ? null : ws.getRow(r).getCell(c).value;

    // 上一筆「有房間數的住宿收入」，給續列繼承用（見下方說明）。
    // chainRow 是「續列可以接在哪一列的下面」，每吃掉一個續列就往下移一格。
    let stay: StayRef | null = null;
    let chainRow = -1;

    for (let r = cols.headerRow + 1; r <= ws.rowCount; r++) {
      const date = asDate(cell(r, cols.date));
      const category = asText(cell(r, cols.category));
      const inc = asNumber(cell(r, cols.income));
      const exp = asNumber(cell(r, cols.expense));
      const handler = asText(cell(r, cols.handler));
      const memo = asText(cell(r, cols.memo));

      // ---- 續列 ----
      // 一筆訂房同時訂了好幾種房型時，老闆只在第一列填科目與金額，
      // 下面幾列只填「來源 / 房間數 / 房型 / 天」（日期有時填有時不填）。
      // 這些列必須接回上一列，不然整筆訂房的房間數與間數都會漏掉
      // （實測 2604 若不處理，總間數會從 100 掉到 71）。
      //
      // 認定條件是「沒有科目」+「緊接在上一筆住宿的正下方」。用相鄰性當關鍵條件，
      // 是因為工作表下方的統計區同樣沒有科目，但它離資料區很遠，這樣就絕不會被誤判。
      if (!category) {
        const prev = stay;
        const rooms = asPosInt(cell(r, cols.rooms));
        const nights = asPosInt(cell(r, cols.nights));
        const roomType = asText(cell(r, cols.roomType));
        if (prev && r === chainRow + 1 && roomType && rooms !== null && nights !== null) {
          rows.push({
            sheet: ws.name,
            excelRow: r,
            entry_date: date ?? prev.date,
            direction: "income",
            category: prev.category,
            amount: 0, // 整筆的金額記在主列，續列只帶房間數
            channel: asText(cell(r, cols.channel)) ?? prev.channel,
            guest_note: asText(cell(r, cols.guest)) ?? prev.guest,
            rooms,
            room_type: roomType,
            nights,
            handler,
            memo,
          });
          chainRow = r; // 讓續列可以一直往下接
          continue;
        }
        if (date && (inc !== null || exp !== null)) {
          skipped.push({ sheet: ws.name, excelRow: r, reason: "沒有填科目" });
        }
        continue;
      }

      if (!date) continue; // 有科目卻沒日期：不是帳目（統計區的標籤）

      const rooms = asInt(cell(r, cols.rooms));
      const nights = asInt(cell(r, cols.nights));
      const base = { sheet: ws.name, excelRow: r, entry_date: date, category, handler, memo };

      // 收入：金額 0 也要收（例如同一組訂房拆成兩列、其中一列 0 元，
      // 但它的房間數／天數仍要計入住宿率與清潔費）。
      const hasRooms = (rooms ?? 0) > 0;
      if (inc !== null || hasRooms) {
        const amount = inc ?? 0;
        const channel = asText(cell(r, cols.channel));
        const guest = asText(cell(r, cols.guest));
        rows.push({
          ...base,
          direction: "income",
          amount,
          channel,
          guest_note: guest,
          rooms,
          room_type: asText(cell(r, cols.roomType)),
          nights,
        });
        income += amount;
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;

        // 只有「有房間數的住宿收入」才可能被續列接下去（傭金收入之類的不會）
        if (hasRooms) {
          stay = { date, category, channel, guest };
          chainRow = r;
        }
      }

      // 支出：同一列可能既有收入又有支出（老闆用這種方式記退款，
      // 例如「1600 收退 300」→ C 欄 1600 收入、K 欄 300 支出）。
      if (exp !== null && exp > 0) {
        if (category === CLEANING) {
          skipped.push({
            sheet: ws.name,
            excelRow: r,
            reason: "清潔費由系統自動計算，匯入會重複",
          });
        } else {
          rows.push({
            ...base,
            direction: "expense",
            amount: exp,
            channel: null,
            guest_note: null,
            rooms: null,
            room_type: null,
            nights: null,
          });
          expense += exp;
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
      }
    }

    sheets.push({
      name: ws.name,
      ledger: true,
      income,
      expense,
      rows: rows.length - before,
      minDate,
      maxDate,
    });
  }

  return { sheets, rows, skipped };
}
