-- =============================================================
-- 升級：清潔費一律記在「現金志剛」
--
-- 原本排程產生的清潔費，收款方式記在「現金（志剛、怡安）」。
-- 改成一律「現金志剛」：包含之後每天排程重算的，以及已經產生過的歷史清潔費。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可以重複執行。
-- =============================================================

-- ---------- 1. 收款方式選項：沒有「現金志剛」就補上，表單與篩選才選得到 ----------
insert into public.payment_methods (name, sort_order) values
  ('現金志剛', 55)
on conflict (name) do nothing;

-- ---------- 2. 重建產生清潔費的函式（與 migration_cleaning_fee_entries.sql 同步）----------
-- 改動：收款方式常數改成「現金志剛」；重算時也會把收款方式／經手人蓋回規定值。
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
  cleaning_handler constant text := '黃志剛';
  cleaning_payment constant text := '現金志剛';
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

  -- 3b. 有住宿的民宿：沒有就新增，有就把金額更新成最新的
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
    cleaning_handler,
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

-- ---------- 3. 已經產生過的清潔費，全部改記「現金志剛」----------
update public.entries
set payment_method = '現金志剛',
    updated_at = now()
where category = '清潔費'
  and payment_method is distinct from '現金志剛';
