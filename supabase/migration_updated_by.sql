-- =============================================================
-- 帳目記錄「最後修改人員」
--
-- 明細那一欄原本只顯示建立人員（created_by），帳被別人改過也看不出來。
-- 新增 updated_by：只有在畫面上按「修改」存檔時才由程式寫入，
-- 所以 null = 從沒被人改過；有值 = 被改過，明細改顯示這個人並標「已修改」。
--
-- 不用 updated_at 判斷：清潔費排程與各支 migration 也會更新 updated_at，
-- 拿它當「被人改過」會誤判。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可以重複執行。
-- =============================================================

alter table public.entries
  add column if not exists updated_by uuid references auth.users(id);

-- ---------- 驗證：跑完貼這段看結果 ----------
-- 應該看到 updated_by 這一欄，型別 uuid
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'entries' and column_name = 'updated_by';
