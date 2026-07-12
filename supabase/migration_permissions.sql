-- =============================================================
-- 升級：權限劃分（真權限，後端 RLS 強制）
-- 角色：管理員(看全部+管理權限) / 一般使用者(依民宿×能力授權)
-- 能力：can_input(輸入帳目) / can_operations(營業數據) / can_cashflow(金流數據)
-- 執行位置：Supabase SQL Editor → 全選貼上 → Run
--   ⚠ 最後一段要把 email 換成你自己的，才能成為第一個管理員。
-- =============================================================

-- 1) 使用者檔案（誰是管理員）
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- 2) 每位使用者 × 每間民宿 的三個能力開關
create table if not exists public.user_property_access (
  user_id        uuid   references auth.users(id) on delete cascade,
  property_id    bigint references public.properties(id) on delete cascade,
  can_input      boolean not null default false,
  can_operations boolean not null default false,
  can_cashflow   boolean not null default false,
  primary key (user_id, property_id)
);

-- 3) 判斷是否管理員（security definer 避免 RLS 遞迴）
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = uid), false);
$$;

-- 4) 新使用者自動建立 profile（在 Supabase 後台新增帳號時觸發）
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

-- 5) 既有帳號補建 profile
insert into public.profiles (id, email)
select id, email from auth.users on conflict (id) do nothing;

-- 6) RLS：profiles / user_property_access
alter table public.profiles              enable row level security;
alter table public.user_property_access  enable row level security;
do $$
begin
  create policy profiles_read on public.profiles for select to authenticated
    using (id = auth.uid() or public.is_admin(auth.uid()));
  create policy profiles_admin_update on public.profiles for update to authenticated
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
  create policy upa_read on public.user_property_access for select to authenticated
    using (user_id = auth.uid() or public.is_admin(auth.uid()));
  create policy upa_admin_all on public.user_property_access for all to authenticated
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
exception when duplicate_object then null;
end $$;

-- 7) 重新設定 entries 權限（取代原本「登入即可讀寫」）
drop policy if exists entries_all    on public.entries;
drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;

create policy entries_select on public.entries for select to authenticated using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.user_property_access a
    where a.user_id = auth.uid() and a.property_id = entries.property_id
      and (a.can_operations or a.can_cashflow or a.can_input)
  )
);
create policy entries_insert on public.entries for insert to authenticated with check (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.user_property_access a
    where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input
  )
);
create policy entries_update on public.entries for update to authenticated using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.user_property_access a
    where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input
  )
);
create policy entries_delete on public.entries for delete to authenticated using (
  public.is_admin(auth.uid())
  or exists (
    select 1 from public.user_property_access a
    where a.user_id = auth.uid() and a.property_id = entries.property_id and a.can_input
  )
);

-- =============================================================
-- 8) ⚠ 設定第一個管理員：把 email 換成你的登入信箱後執行這一行
-- =============================================================
update public.profiles set is_admin = true
where email = 'gary2004930518@gmail.com';
