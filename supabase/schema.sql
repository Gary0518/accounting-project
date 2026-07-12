-- =============================================================
-- 好室行旅 民宿出入帳系統 — 資料庫 Schema (PostgreSQL / Supabase)
-- 在 Supabase Dashboard → SQL Editor 貼上執行即可建立。
-- =============================================================

-- ---------- 1. 通路（訂房來源）----------
create table if not exists public.channels (
  id          bigint generated always as identity primary key,
  name        text    not null unique,          -- 屋主 / booking / agoda ...
  sort_order  int     not null default 100,
  active      boolean not null default true
);

-- ---------- 2. 房型（含實體房間數，用於住宿率分母）----------
create table if not exists public.room_types (
  id          bigint generated always as identity primary key,
  name        text    not null unique,          -- 大床房 / 兩小床 / 四人房 / 三人房
  quantity    int     not null default 1,        -- 這個房型有幾間實體房間
  sort_order  int     not null default 100,
  active      boolean not null default true
);

-- ---------- 3. 科目（收入來源 / 支出科目）----------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text    not null,                  -- 住宿費 / 傭金收入 / 租金支出 ...
  direction   text    not null check (direction in ('income','expense')),
  sort_order  int     not null default 100,
  active      boolean not null default true,
  unique (name, direction)
);

-- ---------- 3.4 收款方式（匯款帳戶 / 現金 / 刷卡）----------
create table if not exists public.payment_methods (
  id          bigint generated always as identity primary key,
  name        text    not null unique,
  sort_order  int     not null default 100,
  active      boolean not null default true
);

-- ---------- 3.5 民宿（可管理多間；每間有各自可售房間數）----------
create table if not exists public.properties (
  id          bigint generated always as identity primary key,
  name        text    not null unique,          -- 民宿名稱
  total_rooms int     not null default 1,        -- 可售房間總數（住宿率分母）
  sort_order  int     not null default 100,
  active      boolean not null default true
);

-- ---------- 4. 帳目（收入 + 支出，共用一張表）----------
create table if not exists public.entries (
  id           uuid primary key default gen_random_uuid(),
  property_id  bigint  references public.properties(id),            -- 屬於哪一間民宿
  entry_date   date    not null,                                    -- 日期
  direction    text    not null check (direction in ('income','expense')),
  category     text    not null,                                    -- 收入來源 / 支出科目
  amount       numeric(12,2) not null check (amount >= 0),          -- 收入 / 支出 金額
  payment_method text,                                              -- 收款方式（主要金額）
  deposit      numeric(12,2) not null default 0,                    -- 訂金（收入用，預設 0）
  deposit_payment_method text,                                      -- 訂金的收款方式
  channel      text,                                                -- 來源（通路）
  guest_note   text,                                                -- 入住說明
  rooms        int     check (rooms  is null or rooms  >= 0),       -- 房間數
  room_type    text,                                                -- 房型
  nights       int     check (nights is null or nights >= 0),       -- 天數
  -- 間數 = 房間數 × 天數（由資料庫自動計算，不需人工填）
  room_nights  int generated always as (coalesce(rooms,0) * coalesce(nights,0)) stored,
  handler      text,                                                -- 經手人
  memo         text,                                                -- 備註（例：1600收退300）
  created_by   uuid    references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_entries_date      on public.entries (entry_date);
create index if not exists idx_entries_direction on public.entries (direction);
create index if not exists idx_entries_channel   on public.entries (channel);
create index if not exists idx_entries_property  on public.entries (property_id);

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_entries_updated on public.entries;
create trigger trg_entries_updated
  before update on public.entries
  for each row execute function public.set_updated_at();

-- ---------- 4.5 權限：使用者檔案 + 每人×每民宿的能力 ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);
create table if not exists public.user_property_access (
  user_id        uuid   references auth.users(id) on delete cascade,
  property_id    bigint references public.properties(id) on delete cascade,
  can_input      boolean not null default false,
  can_operations boolean not null default false,
  can_cashflow   boolean not null default false,
  primary key (user_id, property_id)
);

create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- 5. Row Level Security（真權限，後端強制）
-- =============================================================
alter table public.entries               enable row level security;
alter table public.properties            enable row level security;
alter table public.payment_methods       enable row level security;
alter table public.channels              enable row level security;
alter table public.room_types            enable row level security;
alter table public.categories            enable row level security;
alter table public.profiles              enable row level security;
alter table public.user_property_access  enable row level security;

do $$
begin
  -- 下拉選單資料：登入者可讀寫（民宿名稱等非敏感）
  create policy "properties_all"      on public.properties      for all to authenticated using (true) with check (true);
  create policy "payment_methods_all" on public.payment_methods for all to authenticated using (true) with check (true);
  create policy "channels_all"   on public.channels   for all to authenticated using (true) with check (true);
  create policy "room_types_all" on public.room_types for all to authenticated using (true) with check (true);
  create policy "categories_all" on public.categories for all to authenticated using (true) with check (true);
  -- 權限表：本人可讀自己的；管理員可讀寫全部
  create policy profiles_read        on public.profiles for select to authenticated
    using (id = auth.uid() or public.is_admin(auth.uid()));
  create policy profiles_admin_update on public.profiles for update to authenticated
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  create policy upa_read   on public.user_property_access for select to authenticated
    using (user_id = auth.uid() or public.is_admin(auth.uid()));
  create policy upa_admin  on public.user_property_access for all to authenticated
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  -- entries：管理員全開；一般人依民宿×能力（讀=任一能力、寫=can_input）
  create policy entries_select on public.entries for select to authenticated using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.user_property_access a
      where a.user_id = auth.uid() and a.property_id = entries.property_id
        and (a.can_operations or a.can_cashflow or a.can_input)));
  create policy entries_insert on public.entries for insert to authenticated with check (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.user_property_access a
      where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input));
  create policy entries_update on public.entries for update to authenticated using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.user_property_access a
      where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input));
  create policy entries_delete on public.entries for delete to authenticated using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.user_property_access a
      where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input));
exception when duplicate_object then null;
end $$;

-- 讓即時同步（Realtime）能推播 entries 的異動給所有在線同事
alter publication supabase_realtime add table public.entries;

-- =============================================================
-- 6. 基礎選單資料（通路 / 房型 / 科目）
-- =============================================================
-- 民宿（total_rooms 請依實際可售房間數調整；日後新增民宿只要再 insert 一列）
insert into public.properties (name, total_rooms, sort_order) values
  ('好室行旅', 12, 10),
  ('民宿2', 8, 20)
on conflict (name) do nothing;

insert into public.payment_methods (name, sort_order) values
  ('匯款（永豐-怡安）', 10),
  ('匯款（兆豐-志剛）', 20),
  ('匯款（台企-志剛）', 30),
  ('匯款（台企-怡安）', 40),
  ('現金（志剛、怡安）', 50),
  ('刷卡（壹樓）',       60)
on conflict (name) do nothing;

insert into public.channels (name, sort_order) values
  ('官網(line、電話)',10),('屋主',20),('哈佛',30),('booking',40),('TRIP',50),
  ('立榮',60),('志剛',70),('樂咖',80),('expedia',90),('金豐',100),
  ('怡安',110),('婉鈺',120),('agoda',130),('大玩咖',140),('華信',150),
  ('google',160),('朋友介紹',170)
on conflict (name) do nothing;

-- quantity = 該房型實體房間數；請依實際房間調整（住宿率分母會用到）
insert into public.room_types (name, quantity, sort_order) values
  ('大床房',4,10),('兩小床',5,20),('四人房',2,30),('三人房',1,40)
on conflict (name) do nothing;

insert into public.categories (name, direction, sort_order) values
  ('住宿費','income',10),('傭金收入','income',20),('其他收入','income',30)
on conflict (name, direction) do nothing;

insert into public.categories (name, direction, sort_order) values
  ('租金支出','expense',10),('人事成本','expense',20),('清潔費','expense',30),
  ('送洗費','expense',40),('電費','expense',50),('水費','expense',60),
  ('網路費','expense',70),('電信費','expense',80),('傭金支出','expense',90),
  ('廣告費','expense',100),('會計費用','expense',110),('保險費用','expense',120),
  ('投入攤提','expense',130),('其他支出','expense',140)
on conflict (name, direction) do nothing;
