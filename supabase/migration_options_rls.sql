-- =============================================================
-- 收緊「下拉選單資料表」的寫入權限：所有登入者可讀，只有管理員可寫。
--
-- 為什麼要改：原本的政策是 for all to authenticated using (true)，
-- 等於任何登入的員工都能新增 / 竄改民宿、科目、收款方式等基礎資料
-- （網頁上雖然只有管理員看得到「設定」頁，但懂技術的人可以繞過網頁直接打 API）。
--
-- 用法：Supabase Dashboard → SQL Editor → 貼上整段 → Run。
-- 可重複執行，不會壞掉。
-- =============================================================

do $$
declare
  t text;
begin
  foreach t in array array['properties','payment_methods','channels','room_types','categories']
  loop
    -- 先移除舊的「全開」政策，以及本腳本上次建立的政策（讓這段可以重跑）
    execute format('drop policy if exists %I on public.%I', t || '_all',         t);
    execute format('drop policy if exists %I on public.%I', t || '_read',        t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);

    -- 讀：所有登入者（帳目輸入頁要靠這個載入下拉選單）
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);

    -- 寫（insert / update / delete）：只有管理員
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_admin(auth.uid()))
         with check (public.is_admin(auth.uid()))',
      t || '_admin_write', t);
  end loop;
end $$;

-- 驗證：跑完後這段應列出每張表各有 _read 與 _admin_write 兩條政策
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('properties','payment_methods','channels','room_types','categories')
order by tablename, policyname;
