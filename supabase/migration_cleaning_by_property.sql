-- =============================================================
-- 升級：清潔費依民宿分兩種歸屬
--
--   壹樓文旅（民宿名稱完全等於「壹樓文旅」）→ 匯款（永豐-怡安） / 經手人 陳怡安
--   其他所有民宿                            → 匯款（兆豐-志剛） / 經手人 黃志剛
--
-- 這條規則取代先前的「清潔費一律現金志剛」
-- （migration_cleaning_payment_cash_zhigang.sql）。
-- 那支有沒有跑過都不影響：這支會把所有清潔費重新歸位。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可以重複執行。
-- =============================================================

-- ---------- 1. 用到的收款方式：沒有就補上，表單與篩選才選得到 ----------
insert into public.payment_methods (name, sort_order) values
  ('匯款（永豐-怡安）', 10),
  ('匯款（兆豐-志剛）', 20)
on conflict (name) do nothing;

-- ---------- 2. 重建產生清潔費的函式 ----------
-- 與 migration_cleaning_fee_entries.sql 的差別：收款方式與經手人不再是固定值，
-- 改成看民宿是不是「壹樓文旅」。要改歸屬就改下面這兩個 case。
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
  affected integer;
begin
  -- 2a. 該月已經沒有任何住宿了（帳被刪光或改掉）→ 收掉先前產生的那列
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

  -- 2b. 有住宿的民宿：沒有就新增，有就把金額與歸屬更新成最新的
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
    case when p.name = '壹樓文旅' then '匯款（永豐-怡安）' else '匯款（兆豐-志剛）' end,
    0,
    case when p.name = '壹樓文旅' then '陳怡安' else '黃志剛' end,
    '系統自動計算：房間數 × ' || fee_per_room
  from public.entries s
  join public.properties p on p.id = s.property_id
  where s.direction = 'income'
    and s.category = '住宿費'
    and coalesce(s.rooms, 0) > 0
    and s.entry_date between month_start and month_end
    and s.property_id is not null
  group by s.property_id, p.name
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

-- ---------- 3. 已經記在帳上的清潔費，全部照新規則歸位 ----------
update public.entries e
set payment_method = case when p.name = '壹樓文旅' then '匯款（永豐-怡安）' else '匯款（兆豐-志剛）' end,
    handler        = case when p.name = '壹樓文旅' then '陳怡安' else '黃志剛' end,
    updated_at     = now()
from public.properties p
where p.id = e.property_id
  and e.category = '清潔費'
  and (
    e.payment_method is distinct from
      (case when p.name = '壹樓文旅' then '匯款（永豐-怡安）' else '匯款（兆豐-志剛）' end)
    or e.handler is distinct from
      (case when p.name = '壹樓文旅' then '陳怡安' else '黃志剛' end)
  );

-- ---------- 4. 驗證：跑完貼這段看結果 ----------
-- 每間民宿的清潔費應該只會有一種收款方式／經手人，且符合上面的規則。
select p.name as 民宿, e.payment_method as 收款方式, e.handler as 經手人,
       count(*) as 筆數, sum(e.amount) as 金額合計
from public.entries e
join public.properties p on p.id = e.property_id
where e.category = '清潔費'
group by 1, 2, 3
order by 1, 2;
