-- =============================================================
-- 升級：清潔費從「即時計算」改成「真的記一筆帳」
--
-- 原本清潔費是每次讀取時算出來的（房間數 × 300），資料庫裡沒有這筆，
-- 所以帳目明細加總永遠對不上儀表板的支出。改成每個月底自動記一筆真的帳目，
-- 明細與統計就一致了。
--
-- 規則：每間民宿、每個月一列，日期記在該月最後一天，
--       金額 = 該民宿該月所有住宿費收入的房間數總和 × 300。
--       當月還沒結束就不產生 —— 月中看到的支出不含清潔費是正常的。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- =============================================================

-- ---------- 1. 常數（改金額 / 記在誰頭上，改這裡）----------
-- 注意：lib/domain.ts 也有同名常數，但那邊現在只用於設定頁的說明文字，
-- 真正決定金額的是這支函式。兩邊要改就一起改。

-- ---------- 2. 防重複：每間民宿每個月只能有一列清潔費 ----------
create unique index if not exists uq_entries_cleaning_month
  on public.entries (property_id, entry_date)
  where category = '清潔費';

-- ---------- 3. 產生（或重算）某個月的清潔費 ----------
-- 可以重複執行：已經有的會更新金額，該月已無住宿的會被收掉。
-- security definer：讓排程（以及日後可能的管理員呼叫）不受 RLS 影響。
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

-- ---------- 4. 排程：每天凌晨重算「上個月」與「上上個月」----------
-- 為什麼是每天而不是每月 1 號跑一次：常常有人隔幾天才把帳補登進去。
-- 每天重算就能讓已結束月份的清潔費一直跟著最新的住宿資料。
-- 永遠不碰當月（當月不算清潔費，這是刻意的）。
create extension if not exists pg_cron;

-- 先移除舊的同名排程，讓這支 migration 可以重複執行
select cron.unschedule('generate-cleaning-fees')
where exists (select 1 from cron.job where jobname = 'generate-cleaning-fees');

select cron.schedule(
  'generate-cleaning-fees',
  '0 17 * * *', -- UTC 17:00 = 台灣時間隔天 01:00
  $$
    select public.generate_cleaning_fees((date_trunc('month', current_date) - interval '1 day')::date);
    select public.generate_cleaning_fees((date_trunc('month', current_date) - interval '1 month' - interval '1 day')::date);
  $$
);


-- =============================================================
-- 5.（選用）歷史月份補產生
--
-- 不跑這段的話：過去所有月份的清潔費都會是 0，支出變少、損益全部往上跳，
-- 因為程式端的即時計算已經拿掉了。要讓歷史報表維持正確就要跑這段。
--
-- 跑之前先確認上面的 1～4 都成功了。這段會掃過所有有住宿紀錄的月份。
-- 可以重複執行（重複跑只會更新金額，不會重複記帳）。
-- =============================================================
do $$
declare m date;
begin
  for m in
    select distinct date_trunc('month', entry_date)::date
    from public.entries
    where direction = 'income' and category = '住宿費' and coalesce(rooms, 0) > 0
      -- 當月不產生
      and date_trunc('month', entry_date) < date_trunc('month', current_date)
    order by 1
  loop
    perform public.generate_cleaning_fees(m);
  end loop;
end $$;
