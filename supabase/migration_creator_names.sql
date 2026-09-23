-- =============================================================
-- 明細的「建立人員」顯示中文名字
--
-- entries.created_by 存的是帳號 id（uuid），要顯示成管理頁設定的中文名字，
-- 就得讀 profiles.display_name。但 profiles 的 RLS 是「只看得到自己那列」
-- （管理員除外），一般使用者查別人的名字會查不到。
--
-- 這裡開一個只露出「id + 名字 + email」的 view：
--   * 不含 is_admin，權限設定不會外流；
--   * view 以擁有者（postgres）身分執行，所以繞得過 profiles 的 RLS，
--     這正是我們要的——名字本來就要給同事看。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可以重複執行。
-- =============================================================

create or replace view public.profile_names
with (security_invoker = false) as
select id, display_name, email
from public.profiles;

grant select on public.profile_names to authenticated;

-- ---------- 驗證：跑完貼這段看結果 ----------
-- 應該列出每個帳號的 id 與中文名字；display_name 是空的就去
-- 「設定 → 使用者」填「中文名字」，明細那一欄就會跟著變。
select id, display_name, email from public.profile_names order by display_name nulls last;
