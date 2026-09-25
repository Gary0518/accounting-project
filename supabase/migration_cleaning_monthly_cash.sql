-- =============================================================
-- 升級：清潔費一律記「月結清潔費-現金」，現金-志剛／現金-怡安改回原名
--
-- 1. 還原 migration_cash_cleaning_rename.sql 的改名：
--      現金清潔費（剛） → 現金-志剛
--      現金清潔費（安） → 現金-怡安
--    這兩個是人工記帳用的一般收款方式，歷史帳目一起改回，也不再置底。
-- 2. 新增收款方式「月結清潔費-現金」，排在清單最下面。
-- 3. 每月底排程產生的清潔費一律記在「月結清潔費-現金」，不再依民宿分歸屬。
--    取代 migration_cleaning_by_property.sql 的規則（壹樓文旅／其他民宿兩組）。
--    經手人留空（不再歸給志剛或怡安，現金流「依經手人」會列在「未指定」）。
--    仍是每間民宿每月一列，儀表板依民宿篩選才算得出各自的清潔費。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可重複執行。客戶已經自己改回原名的話，改名那段不會動到任何資料。
-- =============================================================

-- ---------- 1. 現金清潔費（剛／安）改回現金-志剛／現金-怡安 ----------
do $$
declare
  r record;
  cash_sort int;
begin
  for r in
    select * from (values
      ('現金清潔費（剛）', '現金-志剛'),
      ('現金清潔費（安）', '現金-怡安')
    ) as t(old_name, new_name)
  loop
    -- 選項改名；新名字已存在（客戶自己建過）就把舊的停用，避免重複
    if exists (select 1 from public.payment_methods where name = r.new_name) then
      update public.payment_methods set active = false where name = r.old_name;
    else
      update public.payment_methods set name = r.new_name where name = r.old_name;
    end if;

    -- 歷史帳目跟著改回（有裝改名 trigger 的話上面已連動，這裡是保險）
    update public.entries set payment_method = r.new_name
     where payment_method = r.old_name;
    update public.entries set deposit_payment_method = r.new_name
     where deposit_payment_method = r.old_name;
  end loop;

  -- 不再置底：排回其他「現金…」選項後面（志剛在前、怡安在後）
  select max(sort_order) into cash_sort
    from public.payment_methods
   where name like '現金%'
     and name not in ('現金-志剛', '現金-怡安');

  if cash_sort is not null then
    update public.payment_methods set sort_order = cash_sort + 1 where name = '現金-志剛';
    update public.payment_methods set sort_order = cash_sort + 2 where name = '現金-怡安';
  end if;
end $$;

-- ---------- 2. 新增「月結清潔費-現金」，置底 ----------
insert into public.payment_methods (name, sort_order, active)
select '月結清潔費-現金',
       coalesce(max(sort_order), 0) + 10,
       true
  from public.payment_methods
 where name <> '月結清潔費-現金'
on conflict (name) do update
  set sort_order = excluded.sort_order,
      active = true;

-- ---------- 3. 重建產生清潔費的函式 ----------
-- 與 migration_cleaning_by_property.sql 的差別：收款方式固定「月結清潔費-現金」、經手人留空。
create or replace function public.generate_cleaning_fees(target_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  month_end   date := (date_trunc('month', target_month) + interval '1 month' - interval '1 day')::date;
  fee_per_room constant numeric := 300;
  cleaning_payment constant text := '月結清潔費-現金';
  affected integer;
begin
  -- 3a. 該月已經沒有任何住宿了（帳被刪光或改掉）→ 收掉先前產生的那列
  delete from public.entries c
  where c.category = '清潔費'
    and c.entry_date = month_end
    and not exists (
      select 1 from public.entries s
      where s.property_id = c.property_id
        and s.direction = 'income'
        and s.category = '住宿費'
        and coalesce(s.rooms, 0) > 0
        and s.entry_date between month_start and month_end
    );

  -- 3b. 有住宿的民宿：沒有就新增，有就把金額與歸屬更新成最新的
  insert into public.entries (
    property_id, entry_date, direction, category, amount,
    payment_method, deposit, handler, memo
  )
  select
    s.property_id,
    month_end,
    'expense',
    '清潔費',
    sum(coalesce(s.rooms, 0)) * fee_per_room,
    cleaning_payment,
    0,
    null,
    '系統自動計算：房間數 × ' || fee_per_room
  from public.entries s
  where s.direction = 'income'
    and s.category = '住宿費'
    and coalesce(s.rooms, 0) > 0
    and s.entry_date between month_start and month_end
    and s.property_id is not null
  group by s.property_id
  having sum(coalesce(s.rooms, 0)) > 0
  on conflict (property_id, entry_date) where category = '清潔費'
  do update set
    amount = excluded.amount,
    payment_method = excluded.payment_method,
    handler = excluded.handler,
    memo = excluded.memo,
    updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- 4. 已經記在帳上的清潔費，全部改記「月結清潔費-現金」 ----------
update public.entries
set payment_method = '月結清潔費-現金',
    handler = null,
    updated_at = now()
where category = '清潔費'
  and (payment_method is distinct from '月結清潔費-現金' or handler is not null);

-- ---------- 5. 驗證：跑完看結果 ----------
-- a. 「現金-志剛」「現金-怡安」在現金選項附近、「月結清潔費-現金」在最後一列；
--    不該再有 active 的「現金清潔費（剛／安）」。
select name, sort_order, active from public.payment_methods order by sort_order, id;

-- b. 帳目裡不該再有「現金清潔費（剛／安）」（應為 0 列）。
select payment_method, deposit_payment_method, count(*) from public.entries
 where payment_method in ('現金清潔費（剛）', '現金清潔費（安）')
    or deposit_payment_method in ('現金清潔費（剛）', '現金清潔費（安）')
 group by 1, 2;

-- c. 清潔費只剩一種收款方式「月結清潔費-現金」、經手人空白。
select e.payment_method as 收款方式, e.handler as 經手人,
       count(*) as 筆數, sum(e.amount) as 金額合計
from public.entries e
where e.category = '清潔費'
group by 1, 2;
