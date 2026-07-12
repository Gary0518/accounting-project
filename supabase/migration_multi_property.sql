-- =============================================================
-- 升級：支援「多間民宿」
-- 這段可安全地在「已經有資料」的資料庫上執行，不會刪除既有帳目。
-- 執行位置：Supabase Dashboard → SQL Editor → 貼上 → Run
-- =============================================================

-- 1) 新增「民宿」資料表（每間民宿有自己的可售房間數，供住宿率使用）
create table if not exists public.properties (
  id          bigint generated always as identity primary key,
  name        text    not null unique,          -- 民宿名稱
  total_rooms int     not null default 1,        -- 可售房間總數（住宿率分母）
  sort_order  int     not null default 100,
  active      boolean not null default true
);

alter table public.properties enable row level security;
do $$
begin
  create policy "properties_all" on public.properties
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- 2) 建立目前這間民宿（total_rooms 請依實際房間數調整）
insert into public.properties (name, total_rooms, sort_order)
values ('好室行旅', 12, 10)
on conflict (name) do nothing;

-- 3) 帳目表加上「屬於哪間民宿」的欄位
alter table public.entries
  add column if not exists property_id bigint references public.properties(id);

-- 4) 把現有的帳目都歸到「好室行旅」（既有資料不會不見）
update public.entries
set property_id = (select id from public.properties where name = '好室行旅' limit 1)
where property_id is null;

create index if not exists idx_entries_property on public.entries (property_id);

-- 以後要新增民宿，只要這樣一行：
--   insert into public.properties (name, total_rooms) values ('第二間民宿', 8);
