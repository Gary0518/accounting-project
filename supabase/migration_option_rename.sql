-- =============================================================
-- 升級：下拉選項改名時，歷史帳目一起改名
--
-- 原本的問題：帳目（entries）存的是選項的「文字」，不是 id。
-- 在設定頁把「A」改名成「B」，只有選項表那一列變成 B，
-- 舊帳目還是寫著 A —— 篩選、統計就會同時出現 A 和 B 兩個欄位。
--
-- 改法：在四張選項表掛 trigger，name 一變就把 entries 裡的舊文字全部換成新文字。
-- 和改名同一個交易，要嘛全改、要嘛全不改，不會改一半。
--   科目       categories      → entries.category（同收支方向）
--   收款方式   payment_methods → entries.payment_method、entries.deposit_payment_method
--   通路       channels        → entries.channel
--   房型       room_types      → entries.room_type
-- （民宿是用 property_id 外鍵參照，本來就不受改名影響。）
--
-- 第 2 段是一次性修正：把「外匯入帳（ota）」全部改成「外匯入帳-TRIP」。
--
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- 可重複執行，不會壞掉。
-- =============================================================

-- ---------- 1. 改名連動 ----------
-- security definer：管理員本來就能改所有帳目，這裡只是確保 RLS 不會讓連動漏改。
create or replace function public.cascade_option_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  if tg_table_name = 'categories' then
    update public.entries set category = new.name
     where category = old.name and direction = old.direction;
  elsif tg_table_name = 'payment_methods' then
    update public.entries set payment_method = new.name
     where payment_method = old.name;
    update public.entries set deposit_payment_method = new.name
     where deposit_payment_method = old.name;
  elsif tg_table_name = 'channels' then
    update public.entries set channel = new.name
     where channel = old.name;
  elsif tg_table_name = 'room_types' then
    update public.entries set room_type = new.name
     where room_type = old.name;
  end if;

  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['categories','payment_methods','channels','room_types']
  loop
    execute format('drop trigger if exists trg_%s_rename on public.%I', t, t);
    execute format(
      'create trigger trg_%s_rename after update of name on public.%I
         for each row execute function public.cascade_option_rename()',
      t, t);
  end loop;
end $$;

-- ---------- 2. 一次性：外匯入帳（ota）→ 外匯入帳-TRIP ----------
-- 用 ilike 比對，全形／半形括號、大小寫（ota / OTA）都抓得到。
-- 先改帳目（包含之前已經改過名、只剩舊帳目還掛著舊名的情況），
-- 再處理選項表：已經有「外匯入帳-TRIP」就把舊項目停用，沒有就直接改名。
do $$
declare
  target constant text := '外匯入帳-TRIP';
  pat    constant text := '外匯入帳%ota%';
begin
  -- 帳目
  update public.entries set payment_method = target
   where payment_method ilike pat and payment_method <> target;
  update public.entries set deposit_payment_method = target
   where deposit_payment_method ilike pat and deposit_payment_method <> target;
  update public.entries set channel = target
   where channel ilike pat and channel <> target;
  update public.entries set category = target
   where category ilike pat and category <> target;

  -- 選項表：收款方式、通路（name 唯一）
  if exists (select 1 from public.payment_methods where name = target) then
    update public.payment_methods set active = false where name ilike pat and name <> target;
    update public.payment_methods set active = true  where name = target;
  else
    update public.payment_methods set name = target where id = (
      select id from public.payment_methods where name ilike pat
       order by active desc, id limit 1);
    update public.payment_methods set active = false where name ilike pat and name <> target;
  end if;

  if exists (select 1 from public.channels where name = target) then
    update public.channels set active = false where name ilike pat and name <> target;
    update public.channels set active = true  where name = target;
  else
    update public.channels set name = target where id = (
      select id from public.channels where name ilike pat
       order by active desc, id limit 1);
    update public.channels set active = false where name ilike pat and name <> target;
  end if;

  -- 科目（name + direction 唯一，收入／支出分開處理）
  update public.categories c set active = false
   where c.name ilike pat and c.name <> target
     and exists (select 1 from public.categories x
                  where x.name = target and x.direction = c.direction);
  update public.categories c set name = target
   where c.name ilike pat and c.name <> target and c.active
     and not exists (select 1 from public.categories x
                      where x.name = target and x.direction = c.direction);
end $$;

-- ---------- 3. 檢查 ----------
-- (a) 應該查不到任何「外匯入帳…ota」
select 'entries' as src, payment_method, deposit_payment_method, channel, category
from public.entries
where payment_method ilike '外匯入帳%ota%' or deposit_payment_method ilike '外匯入帳%ota%'
   or channel ilike '外匯入帳%ota%' or category ilike '外匯入帳%ota%';

-- (b) 帳目裡還掛著「選項表找不到」的名字（之前改過名留下的舊名）。
--     若有列出來，代表那些是以前改名前的舊文字，可照第 2 段的寫法手動併過去。
select 'payment_method' as col, e.payment_method as name, count(*)
  from public.entries e
 where e.payment_method is not null
   and not exists (select 1 from public.payment_methods o where o.name = e.payment_method)
 group by 2
union all
select 'deposit_payment_method', e.deposit_payment_method, count(*)
  from public.entries e
 where e.deposit_payment_method is not null
   and not exists (select 1 from public.payment_methods o where o.name = e.deposit_payment_method)
 group by 2
union all
select 'channel', e.channel, count(*)
  from public.entries e
 where e.channel is not null
   and not exists (select 1 from public.channels o where o.name = e.channel)
 group by 2
union all
select 'room_type', e.room_type, count(*)
  from public.entries e
 where e.room_type is not null
   and not exists (select 1 from public.room_types o where o.name = e.room_type)
 group by 2
union all
select 'category', e.category, count(*)
  from public.entries e
 where not exists (select 1 from public.categories o
                    where o.name = e.category and o.direction = e.direction)
 group by 2;
