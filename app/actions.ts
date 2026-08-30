"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccess, allowedPropertyIds } from "@/lib/access";
import { type Entry, type RecentEntriesPage } from "@/lib/domain";
import {
  canonical,
  parseWorkbook,
  type CommitPayload,
  type ImportPreview,
} from "@/lib/import-excel";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** 目前登入者要記成哪個「經手人」（顯示名 → email）。 */
async function currentHandler(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.display_name || profile?.email || user.email || null;
}

/**
 * 把表單內容攤成要寫進 entries 的那幾列（新增與修改共用）。
 *
 * 一張訂單可以有多個房型，一個房型一列；金額與訂金全掛在第一列，
 * 第二列起是 0 —— 一張訂單只有一筆錢，拆列只是為了記下各房型的房間數。
 *
 * @param handler   經手人（修改時沿用原本的，不改記在誰頭上）
 * @param bookingId 多列時共用的識別碼；只有一列時傳 null
 */
function buildEntryRows(formData: FormData, handler: string | null, bookingId: string | null) {
  const direction = String(formData.get("direction")) as "income" | "expense";
  const toInt = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const toStr = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : String(v);
  };

  const income = direction === "income";

  // 房型可以填多組（一張訂單訂了大床房 ×1 + 小床房 ×2）。
  // 天數是整張訂單共用的，所以只填一次，寫入時複製到每一列
  // ——room_nights 是資料庫算的 rooms × nights，不複製的話間數會變 0。
  const nights = income ? toInt("nights") : null;
  const roomTypes = formData.getAll("room_type").map((v) => String(v).trim());
  const roomCounts = formData.getAll("rooms").map((v) => String(v).trim());
  const roomLines = income
    ? roomTypes
        .map((room_type, i) => ({
          room_type: room_type || null,
          rooms: roomCounts[i] === "" || roomCounts[i] === undefined ? null : Number(roomCounts[i]),
        }))
        .filter((r) => r.room_type !== null || r.rooms !== null)
    : [];
  // 沒填任何房型（支出、或不帶房型的收入）仍然要寫一列
  const lines = roomLines.length ? roomLines : [{ room_type: null, rooms: null }];

  const base = {
    property_id: Number(formData.get("property_id")),
    entry_date: String(formData.get("entry_date")),
    direction,
    category: String(formData.get("category")),
    payment_method: toStr("payment_method"),
    deposit_payment_method: income ? toStr("deposit_payment_method") : null,
    channel: income ? toStr("channel") : null,
    guest_note: income ? toStr("guest_note") : null,
    nights,
    handler,
    memo: toStr("memo"),
  };

  return lines.map((line, i) => ({
    ...base,
    ...line,
    booking_id: lines.length > 1 ? bookingId : null,
    amount: i === 0 ? Number(formData.get("amount")) : 0,
    deposit: income && i === 0 ? Number(formData.get("deposit") || 0) : 0,
  }));
}

/** 新增一筆帳目（收入或支出）。 */
export async function createEntry(formData: FormData) {
  const supabase = await createClient();
  const rows = buildEntryRows(formData, await currentHandler(), randomUUID());

  const { error } = await supabase.from("entries").insert(rows);
  if (error) {
    console.error("createEntry failed:", error);
    throw new Error("新增帳目失敗");
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

/**
 * 修改一筆帳目（多房型的訂單是整張一起改）。
 *
 * 不用「先刪光再重寫」：那在寫入失敗時會把帳整筆弄丟。改成逐列比對——
 * 舊列夠用就原地更新（id 保留），不夠就補、多出來就刪，任一步失敗都還留著原本的資料。
 */
export async function updateEntry(formData: FormData) {
  const key = String(formData.get("booking_key") ?? "");
  // key 會被拼進查詢字串，先確認它真的是 uuid
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error("找不到要修改的帳目");
  }

  const access = await getAccess();
  if (!access) throw new Error("尚未登入");
  const allowed = allowedPropertyIds(access, "input");
  const target = Number(formData.get("property_id"));
  // 縱深防禦：RLS 已經擋一層，這裡再確認一次不能把帳改到沒權限的民宿
  if (allowed && !allowed.includes(target)) throw new Error("沒有這間民宿的權限");

  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("entries")
    .select("*")
    .or(`id.eq.${key},booking_id.eq.${key}`);
  if (readErr || !existing?.length) {
    console.error("updateEntry read failed:", readErr);
    throw new Error("找不到要修改的帳目");
  }

  // 舊列排序方式要與畫面一致：帶金額的那列算第一列
  const old = [...existing].sort(
    (a, b) => b.amount + (b.deposit ?? 0) - (a.amount + (a.deposit ?? 0)),
  );
  // 經手人沿用原本的：修改不代表這筆帳換人負責
  const handler = old[0].handler ?? (await currentHandler());
  const rows = buildEntryRows(formData, handler, old[0].booking_id ?? key);

  const ops: PromiseLike<{ error: unknown }>[] = [];
  for (let i = 0; i < Math.max(old.length, rows.length); i++) {
    if (i < rows.length && i < old.length) {
      ops.push(supabase.from("entries").update(rows[i]).eq("id", old[i].id));
    } else if (i < rows.length) {
      ops.push(supabase.from("entries").insert(rows[i]));
    } else {
      ops.push(supabase.from("entries").delete().eq("id", old[i].id));
    }
  }
  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error("updateEntry write failed:", failed.error);
    throw new Error("修改帳目失敗");
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

// 「最近帳目」一頁幾列（同一張訂單的續列也算一列）
const RECENT_PAGE_SIZE = 30;
// 一頁結尾剛好切在多房型訂單中間時，最多再多帶幾列把那張訂單補完
const RECENT_LOOKAHEAD = 10;

/**
 * 讀「最近帳目」的一頁。
 *
 * 進站時右邊面板是空的、不呼叫這裡，所以首頁少一趟查詢；使用者選了民宿才載入；
 * 往後的每一頁也是按了「下一頁」才去查。
 *
 * 用 offset 而不是頁碼：一頁結尾若切在多房型訂單中間，會多讀幾列把那張訂單補完
 * （不然續列會單獨出現在下一頁最上面，看起來像一筆 0 元的帳），
 * 實際吃掉的列數因此不固定，下一頁的起點由這裡回傳。
 *
 * @param view 民宿 id 字串，或 "all" 代表全部（僅限自己看得到的那些）
 * @param offset 這一頁從第幾列開始（第一頁 0）
 */
export async function loadRecentEntries(
  view: string,
  offset = 0,
): Promise<RecentEntriesPage> {
  const empty: RecentEntriesPage = { rows: [], nextOffset: 0, hasMore: false };
  const access = await getAccess();
  if (!access) throw new Error("尚未登入");
  // 與左邊表單同一組民宿：可輸入的才列得出來
  const allowed = allowedPropertyIds(access, "input");

  const from = Math.max(0, Math.trunc(offset));

  const supabase = await createClient();
  let q = supabase
    .from("entries")
    .select("*")
    .order("entry_date", { ascending: false })
    // 同一張訂單的列要排在一起、且每次查詢順序固定，翻頁才不會有列重複或漏掉
    .order("booking_id", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(from, from + RECENT_PAGE_SIZE + RECENT_LOOKAHEAD - 1);

  if (view === "all") {
    // 管理員 allowed=null → 不加條件；一般人限縮在自己可輸入的民宿
    // （空陣列以 [-1] 佔位，否則 .in([]) 會變成查全部）
    if (allowed) q = q.in("property_id", allowed.length ? allowed : [-1]);
  } else {
    const id = Number(view);
    if (!Number.isFinite(id)) return empty;
    // RLS 已經擋一層，這裡再擋一次：沒權限的民宿一律當作沒有資料
    if (allowed && !allowed.includes(id)) return empty;
    q = q.eq("property_id", id);
  }

  const { data, error } = await q;
  if (error) {
    console.error("loadRecentEntries failed:", error);
    throw new Error("讀取最近帳目失敗");
  }

  const fetched = (data ?? []) as Entry[];
  const rows = fetched.slice(0, RECENT_PAGE_SIZE);
  // 補完最後一張訂單：多讀的那幾列裡，凡是屬於本頁已出現的訂單就一起收進來
  const keys = new Set(rows.map((e) => e.booking_id ?? e.id));
  for (const e of fetched.slice(RECENT_PAGE_SIZE)) {
    if (!keys.has(e.booking_id ?? e.id)) break;
    rows.push(e);
  }

  return {
    rows,
    nextOffset: from + rows.length,
    hasMore: fetched.length > rows.length,
  };
}

/** 管理員：更新某使用者的權限（是否管理員 + 每間民宿的三個能力）。 */
export async function updateUserAccess(formData: FormData) {
  // 縱深防禦：不只靠 RLS，後端動作自己也確認呼叫者為管理員。
  const access = await getAccess();
  if (!access?.isAdmin) throw new Error("需要管理員權限");

  const supabase = await createClient();
  const userId = String(formData.get("user_id"));
  const isAdmin = formData.get("is_admin") === "on";
  const displayNameRaw = String(formData.get("display_name") ?? "").trim();
  const displayName = displayNameRaw === "" ? null : displayNameRaw;

  const { data: props } = await supabase
    .from("properties")
    .select("id")
    .eq("active", true);

  const rows = (props ?? []).map((p) => ({
    user_id: userId,
    property_id: p.id,
    can_input: formData.get(`input_${p.id}`) === "on",
    can_operations: formData.get(`operations_${p.id}`) === "on",
    can_cashflow: formData.get(`cashflow_${p.id}`) === "on",
  }));

  if (rows.length) {
    const { error } = await supabase.from("user_property_access").upsert(rows);
    if (error) {
      console.error("updateUserAccess (upa) failed:", error);
      throw new Error("更新權限失敗");
    }
  }
  const { error: pErr } = await supabase
    .from("profiles")
    .update({ is_admin: isAdmin, display_name: displayName })
    .eq("id", userId);
  if (pErr) {
    console.error("updateUserAccess (profile) failed:", pErr);
    throw new Error("更新權限失敗");
  }

  revalidatePath("/admin");
}

// =============================================================
// 設定 → 調整項目：帳目輸入頁那些下拉選單的內容
// =============================================================

/**
 * 可管理的下拉選單資料表。
 * 這是白名單：table 名稱來自表單，若不先擋掉就等於讓前端指定要動哪張表。
 * amountField = 除了名稱外還要編輯的數字欄位（民宿的可售房間數）。
 */
const OPTION_TABLES = {
  properties: { label: "民宿", amountField: "total_rooms" },
  categories: { label: "科目", amountField: null },
  payment_methods: { label: "收款方式", amountField: null },
  channels: { label: "通路", amountField: null },
  room_types: { label: "房型", amountField: null },
} as const;

export type OptionTable = keyof typeof OPTION_TABLES;

function assertOptionTable(v: FormDataEntryValue | null): OptionTable {
  const t = String(v);
  if (!(t in OPTION_TABLES)) throw new Error("未知的項目類別");
  return t as OptionTable;
}

async function requireAdmin() {
  // 縱深防禦：這些表的 RLS 對所有登入者開放寫入，所以後端動作自己再確認一次。
  const access = await getAccess();
  if (!access?.isAdmin) throw new Error("需要管理員權限");
}

/**
 * 新增一個下拉選項。
 * 若同名項目曾被停用過，改為重新啟用（因為 name 有 unique 限制，直接 insert 會撞）。
 */
export async function addOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("名稱不可空白");

  const supabase = await createClient();
  const { amountField } = OPTION_TABLES[table];

  // 科目的唯一鍵是 (name, direction)，其餘表只有 name
  const direction =
    table === "categories" ? String(formData.get("direction")) : null;
  if (table === "categories" && direction !== "income" && direction !== "expense") {
    throw new Error("科目必須指定收入或支出");
  }

  const row: Record<string, unknown> = { name, active: true };
  if (direction) row.direction = direction;
  if (amountField) {
    const n = Number(formData.get(amountField));
    if (Number.isFinite(n) && n > 0) row[amountField] = n;
  }

  // 先找同名（同 direction）的既有列：有就復用，沒有才新增
  let q = supabase.from(table).select("id").eq("name", name).limit(1);
  if (direction) q = q.eq("direction", direction);
  const { data: existing } = await q;

  // 全新項目排到最後：取目前最大的 sort_order + 10。
  // （不設的話會吃 default 100，之後新增的項目會全部並在一起、順序不定。）
  if (!existing?.length) {
    let mq = supabase
      .from(table)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (direction) mq = mq.eq("direction", direction);
    const { data: max } = await mq;
    row.sort_order = (Number(max?.[0]?.sort_order) || 0) + 10;
  }

  const { error } = existing?.length
    ? await supabase.from(table).update(row).eq("id", existing[0].id)
    : await supabase.from(table).insert(row);

  if (error) {
    console.error(`addOption(${table}) failed:`, error);
    throw new Error("新增項目失敗");
  }
  revalidateAll();
}

/**
 * 移除一個下拉選項 —— 停用（active=false）而非真的刪列。
 * 理由：帳目已經用文字記下當時的科目 / 收款方式，民宿更是被 entries.property_id 外鍵參照；
 * 真的 delete 會讓歷史帳目對不到或直接違反外鍵。停用後選單不再出現，歷史帳目完好。
 */
export async function removeOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("項目不存在");

  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ active: false }).eq("id", id);
  if (error) {
    console.error(`removeOption(${table}) failed:`, error);
    throw new Error("移除項目失敗");
  }
  revalidateAll();
}

/**
 * 修改一個下拉選項的名稱（民宿還可改可售房間數）。
 * 不動 active／sort_order，歷史帳目也不受影響（帳目存的是當時的文字）。
 */
export async function updateOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("項目不存在");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("名稱不可空白");

  const supabase = await createClient();
  const { amountField } = OPTION_TABLES[table];

  const row: Record<string, unknown> = { name };
  if (amountField) {
    const n = Number(formData.get(amountField));
    if (Number.isFinite(n) && n > 0) row[amountField] = n;
  }

  const { error } = await supabase.from(table).update(row).eq("id", id);
  if (error) {
    console.error(`updateOption(${table}) failed:`, error);
    // 23505＝unique 違反：改成了已存在的名稱（科目是 name+direction）
    if (error.code === "23505") throw new Error("已經有同名項目了");
    throw new Error("修改項目失敗");
  }
  revalidateAll();
}

/**
 * 上移／下移一個下拉選項。
 * 做法：撈出這個選單目前顯示的項目（順序與設定頁一致），把目標和相鄰項對調，
 * 再把整份清單重寫成間隔 10 的排序值 —— 順帶修好舊資料一律 sort_order=100 造成的並列。
 */
export async function reorderOption(formData: FormData) {
  await requireAdmin();
  const table = assertOptionTable(formData.get("table"));
  const id = Number(formData.get("id"));
  const dir = String(formData.get("dir"));
  if (!Number.isFinite(id)) throw new Error("項目不存在");
  if (dir !== "up" && dir !== "down") throw new Error("方向錯誤");

  const supabase = await createClient();

  let q = supabase.from(table).select("id").eq("active", true).order("sort_order").order("id");
  if (table === "categories") {
    const direction = String(formData.get("direction"));
    if (direction !== "income" && direction !== "expense") {
      throw new Error("科目必須指定收入或支出");
    }
    // 與設定頁一致：科目依收支方向分開排序，清潔費不在清單內
    q = q.eq("direction", direction).neq("name", "清潔費");
  }

  const { data: rows, error: selErr } = await q;
  if (selErr || !rows) {
    console.error(`reorderOption(${table}) read failed:`, selErr);
    throw new Error("排序失敗");
  }

  const order = rows.map((r) => r.id as number);
  const i = order.indexOf(id);
  if (i < 0) return; // 已不在清單（例如剛被別人移除）
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return; // 已在頂／底，不用動
  [order[i], order[j]] = [order[j], order[i]];

  const results = await Promise.all(
    order.map((rid, idx) =>
      supabase.from(table).update({ sort_order: (idx + 1) * 10 }).eq("id", rid),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error(`reorderOption(${table}) write failed:`, failed.error);
    throw new Error("排序失敗");
  }
  revalidateAll();
}

/** 選單內容變動會影響帳目輸入頁與兩個儀表板，全部重新產生。 */
function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

// =============================================================
// 設定 → 匯入舊資料（老闆那份一個月一張工作表的 Excel）
// =============================================================

/**
 * 第一步：解析上傳的 Excel，回傳預覽。這一步不寫入任何東西。
 * 順便做三件事：把通路 / 房型的大小寫對回選單裡的正式寫法、找出選單裡沒有的新項目、
 * 檢查這段期間該民宿是不是已經有帳目了（重複匯入會把營收記成兩倍）。
 */
export async function previewImport(formData: FormData): Promise<ImportPreview> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("請選擇一個 Excel 檔");
  const propertyId = Number(formData.get("property_id"));
  if (!Number.isFinite(propertyId)) throw new Error("請選擇要匯入哪一間民宿");

  const parsed = await parseWorkbook(await file.arrayBuffer());

  const supabase = await createClient();
  const [{ data: channels }, { data: roomTypes }, { data: cats }, { data: profiles }] =
    await Promise.all([
      supabase.from("channels").select("name").eq("active", true),
      supabase.from("room_types").select("name").eq("active", true),
      supabase.from("categories").select("name, direction").eq("active", true),
      supabase.from("profiles").select("display_name").not("display_name", "is", null),
    ]);

  const channelNames = (channels ?? []).map((c) => c.name);
  const roomTypeNames = (roomTypes ?? []).map((r) => r.name);
  // 科目的唯一鍵是「名稱 + 收支方向」：同一個「住宿費」可以既是收入科目、
  // 又是支出科目（老闆就是拿支出的住宿費來記退款）。中間用 \u0000 串接，
  // 是因為這個字元絕不會出現在名稱裡，科目名就算有空格也不會被拆錯。
  const catNames = (cats ?? []).map((c) => `${c.name}\u0000${c.direction}`);

  // 正規化：'trip' → 'TRIP'、'Expedia' → 'expedia'，避免同一個通路在報表上裂成兩塊
  const rows = parsed.rows.map((r) => ({
    ...r,
    channel: canonical(r.channel, channelNames),
    room_type: canonical(r.room_type, roomTypeNames),
  }));

  const missing = <T>(xs: T[], has: (x: T) => boolean) => [...new Set(xs)].filter((x) => !has(x));
  const newChannels = missing(
    rows.map((r) => r.channel).filter((x): x is string => !!x),
    (n) => channelNames.includes(n),
  );
  const newRoomTypes = missing(
    rows.map((r) => r.room_type).filter((x): x is string => !!x),
    (n) => roomTypeNames.includes(n),
  );
  const newCategories = missing(
    rows.map((r) => `${r.category}\u0000${r.direction}`),
    (k) => catNames.includes(k),
  ).map((k) => {
    const [name, direction] = k.split("\u0000");
    return { name, direction: direction as "income" | "expense" };
  });

  // 重複匯入偵測：該民宿在這段期間是否已有帳目
  const dates = rows.map((r) => r.entry_date).sort();
  let existing: ImportPreview["existing"] = null;
  if (dates.length) {
    const start = dates[0];
    const end = dates[dates.length - 1];
    const { count } = await supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .gte("entry_date", start)
      .lte("entry_date", end);
    if (count && count > 0) existing = { count, start, end };
  }

  return {
    sheets: parsed.sheets,
    rows,
    skipped: parsed.skipped,
    handlers: [...new Set(rows.map((r) => r.handler).filter((x): x is string => !!x))],
    profiles: (profiles ?? []).map((p) => ({ name: p.display_name as string })),
    newChannels,
    newRoomTypes,
    newCategories,
    existing,
    refunds: rows.filter((r) => r.direction === "expense" && r.category === "住宿費").length,
  };
}

/** 第二步：把預覽過的資料真的寫進去。 */
export async function commitImport(payload: CommitPayload): Promise<number> {
  await requireAdmin();

  const { propertyId, sheets, rows, handlerMap, addOptions } = payload;
  if (!Number.isFinite(propertyId)) throw new Error("請選擇要匯入哪一間民宿");

  const keep = rows.filter((r) => sheets.includes(r.sheet));
  if (!keep.length) throw new Error("沒有選到任何要匯入的工作表");

  // 前端送來的資料不能照單全收（就算只有管理員按得到，壞資料還是會弄髒報表）
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const payloadRows = keep.map((r) => {
    if (!isDate(r.entry_date)) throw new Error(`日期格式不對：${r.sheet} 第 ${r.excelRow} 列`);
    if (r.direction !== "income" && r.direction !== "expense") throw new Error("方向不對");
    if (!r.category?.trim()) throw new Error(`沒有科目：${r.sheet} 第 ${r.excelRow} 列`);
    if (!Number.isFinite(r.amount) || r.amount < 0) {
      throw new Error(`金額不對：${r.sheet} 第 ${r.excelRow} 列`);
    }
    const income = r.direction === "income";
    const mapped = r.handler ? handlerMap[r.handler]?.trim() : "";
    return {
      property_id: propertyId,
      entry_date: r.entry_date,
      direction: r.direction,
      category: r.category.trim(),
      amount: r.amount,
      // 老闆的 Excel 沒有「收款方式」這一欄，匯入的舊帳一律留空
      payment_method: null,
      deposit: 0,
      deposit_payment_method: null,
      channel: income ? r.channel : null,
      guest_note: income ? r.guest_note : null,
      rooms: income ? r.rooms : null,
      room_type: income ? r.room_type : null,
      nights: income ? r.nights : null,
      handler: mapped || null,
      memo: r.memo,
    };
  });

  const supabase = await createClient();

  if (addOptions) {
    const at = (t: "channels" | "room_types") => [
      ...new Set(
        keep
          .map((r) => (t === "channels" ? r.channel : r.room_type))
          .filter((x): x is string => !!x),
      ),
    ];
    await Promise.all([
      ...at("channels").map((name) =>
        supabase.from("channels").upsert({ name, active: true }, { onConflict: "name" }),
      ),
      ...at("room_types").map((name) =>
        supabase.from("room_types").upsert({ name, active: true }, { onConflict: "name" }),
      ),
      ...[...new Set(keep.map((r) => `${r.category}\u0000${r.direction}`))].map((k) => {
        const [name, direction] = k.split("\u0000");
        return supabase
          .from("categories")
          .upsert({ name, direction, active: true }, { onConflict: "name,direction" });
      }),
    ]);
  }

  // 分批寫入：一次塞太多列容易被 Supabase 的請求大小限制擋下來
  for (let i = 0; i < payloadRows.length; i += 200) {
    const { error } = await supabase.from("entries").insert(payloadRows.slice(i, i + 200));
    if (error) {
      console.error("commitImport failed:", error);
      throw new Error(`寫入失敗（已寫入 ${i} 筆）：${error.message}`);
    }
  }

  revalidateAll();
  return payloadRows.length;
}

/**
 * 刪除一筆帳目。
 * 多房型的訂單在資料表裡是好幾列，整張一起刪 —— 只刪一列的話，
 * 若刪掉的是帶金額的第一列，剩下的 0 元列會留在帳上，錢就憑空消失了。
 */
export async function deleteEntry(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));

  const { data: row } = await supabase
    .from("entries")
    .select("booking_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = row?.booking_id
    ? await supabase.from("entries").delete().eq("booking_id", row.booking_id)
    : await supabase.from("entries").delete().eq("id", id);
  if (error) {
    console.error("deleteEntry failed:", error);
    throw new Error("刪除帳目失敗");
  }
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}
