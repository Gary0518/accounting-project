-- =============================================================
-- 收款方式改名，並移到清單最下面
--   現金-志剛 → 現金清潔費（剛）
--   現金-怡安 → 現金清潔費（安）
--
-- 帳目（entries）存的是收款方式的「文字」，所以歷史帳目也要一起改名，
-- 否則篩選、統計會同時出現新舊兩個名字。
-- 裝過 migration_option_rename.sql 的話 trigger 會自動連動；
-- 這裡再直接改一次 entries，沒裝 trigger 也不會漏。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可重複執行：第二次跑時舊名已不存在，改名那段不會動到任何資料。
-- =============================================================

do $$
declare
  r record;
  max_sort int;
begin
  -- 先算好「其他選項」的最大排序，兩個清潔費現金都排在它後面
  select coalesce(max(sort_order), 0) into max_sort
    from public.payment_methods
   where name not in ('現金-志剛', '現金-怡安', '現金清潔費（剛）', '現金清潔費（安）');

  for r in
    select * from (values
      ('現金-志剛', '現金清潔費（剛）', 1),
      ('現金-怡安', '現金清潔費（安）', 2)
    ) as t(old_name, new_name, ord)
    order by ord
  loop
    -- 1. 選項改名（新名字已存在就不改，避免重複）
    update public.payment_methods
       set name = r.new_name
     where name = r.old_name
       and not exists (select 1 from public.payment_methods where name = r.new_name);

    -- 2. 歷史帳目跟著改名
    update public.entries set payment_method = r.new_name
     where payment_method = r.old_name;
    update public.entries set deposit_payment_method = r.new_name
     where deposit_payment_method = r.old_name;

    -- 3. 排到最後（剛 在前、安 在後）
    update public.payment_methods
       set sort_order = max_sort + 10 * r.ord
     where name = r.new_name;
  end loop;
end $$;

-- ---------- 驗證：跑完看結果 ----------
-- 最後兩列應該是「現金清潔費（剛）」「現金清潔費（安）」；
-- 帳目裡不該再有舊名字（第二段應為 0 筆）。
select name, sort_order, active from public.payment_methods order by sort_order, id;

select payment_method, count(*) from public.entries
 where payment_method in ('現金-志剛', '現金-怡安')
    or deposit_payment_method in ('現金-志剛', '現金-怡安')
 group by payment_method;
