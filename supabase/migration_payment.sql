-- =============================================================
-- 升級：新增「收款方式」與「訂金」
-- 可安全地在已有資料的資料庫上執行（既有帳目的訂金會自動補 0）。
-- 執行位置：Supabase Dashboard → SQL Editor → 全選貼上 → Run
-- =============================================================

-- 1) 收款方式清單（跟通路一樣，日後可自行增修）
create table if not exists public.payment_methods (
  id          bigint generated always as identity primary key,
  name        text    not null unique,
  sort_order  int     not null default 100,
  active      boolean not null default true
);

alter table public.payment_methods enable row level security;
do $$
begin
  create policy "payment_methods_all" on public.payment_methods
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

insert into public.payment_methods (name, sort_order) values
  ('匯款（永豐-怡安）', 10),
  ('匯款（兆豐-志剛）', 20),
  ('匯款（台企-志剛）', 30),
  ('匯款（台企-怡安）', 40),
  ('現金（志剛、怡安）', 50),
  ('刷卡（壹樓）',       60)
on conflict (name) do nothing;

-- 2) 帳目表加上收款方式與訂金欄位
alter table public.entries add column if not exists payment_method         text;
alter table public.entries add column if not exists deposit                numeric(12,2) not null default 0; -- 訂金，預設 0
alter table public.entries add column if not exists deposit_payment_method text;                              -- 訂金的收款方式
