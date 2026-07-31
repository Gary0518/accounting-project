-- =============================================================
-- 升級：一張訂單可以有多個房型
-- 做法：同一張訂單拆成多列帳目，共用一個 booking_id；
--       金額與訂金全掛在第一列，第二列起金額為 0（只記房型與房間數）。
-- 可安全地在已有資料的資料庫上執行（既有帳目的 booking_id 留 null，
-- 統計時視為「每列各自一張訂單」，行為與升級前完全相同）。
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- =============================================================

alter table public.entries add column if not exists booking_id uuid;

-- 刪除整張訂單、以及「住宿筆數」去重都要靠這個欄位查
create index if not exists idx_entries_booking on public.entries (booking_id);
