-- =============================================================
-- 示範資料：重現 PDF 中「2026 年 6 月」的帳目
-- 用途：讓你一登入就看到儀表板對得上舊 Excel。正式使用前可整批刪除：
--   delete from public.entries where entry_date between '2026-06-01' and '2026-06-30';
-- 驗證重點：通路加總 = 83,627、支出加總 = 120,733、間數 = 51（與 PDF 一致）
-- =============================================================

-- ---------- 收入：住宿費 ----------
insert into public.entries (entry_date, direction, category, amount, channel, guest_note, rooms, room_type, nights, memo) values
  ('2026-06-01','income','住宿費', 3200,'志剛','明璇',1,'兩小床',2,null),
  ('2026-06-05','income','住宿費', 6000,'屋主','鳳英朋友',2,'兩小床',2,null),
  ('2026-06-05','income','住宿費', 4400,'booking','malcolm',1,'大床房',2,null),
  ('2026-06-06','income','住宿費', 1450,'樂咖','詹林',1,'大床房',1,null),
  ('2026-06-10','income','住宿費', 1397,'booking','陳詠宗',1,'兩小床',1,null),
  ('2026-06-10','income','住宿費', 2800,'哈佛','雄哥',2,'大床房',1,null),
  ('2026-06-12','income','住宿費', 1300,'樂咖','藍俊興',1,'兩小床',1,null),
  ('2026-06-13','income','住宿費', 2800,'哈佛','雄哥',2,'大床房',1,null),
  ('2026-06-14','income','住宿費', 1138,'TRIP','wang kui lan',1,'兩小床',1,null),
  ('2026-06-16','income','住宿費', 6300,'官網(line、電話)','葉小娟',1,'四人房',3,null),
  ('2026-06-17','income','住宿費',11900,'官網(line、電話)','許小米',1,'三人房',7,null),
  ('2026-06-19','income','住宿費', 1462,'TRIP','zhou yujun',1,'大床房',1,null),
  ('2026-06-19','income','住宿費', 1814,'booking','linz zbin',1,'大床房',1,null),
  ('2026-06-19','income','住宿費', 1300,'樂咖','李培森',1,'兩小床',1,null),
  ('2026-06-19','income','住宿費', 1300,'樂咖','徐夢緣',1,'兩小床',1,null),
  ('2026-06-20','income','住宿費', 4500,'屋主','陳永閔',3,'兩小床',1,null),
  ('2026-06-20','income','住宿費', 1600,'怡安','莊先生',1,'大床房',1,'1600收退300'),
  ('2026-06-21','income','住宿費', 1500,'志剛','雷哥',1,'大床房',1,null),
  ('2026-06-23','income','住宿費', 1400,'志剛','蔡鈞浩',1,'大床房',1,null),
  ('2026-06-24','income','住宿費', 1500,'婉鈺','婉鈺',1,'兩小床',1,'退'),
  ('2026-06-25','income','住宿費', 6500,'立榮','李俊賢',1,'四人房',3,null),
  ('2026-06-25','income','住宿費', 2600,'哈佛','李芝君',2,'大床房',1,null),
  ('2026-06-26','income','住宿費', 4500,'屋主',null,1,'兩小床',3,null),
  ('2026-06-27','income','住宿費', 1313,'TRIP','zhu qilin',1,'兩小床',1,null),
  ('2026-06-27','income','住宿費', 2267,'expedia','lin ming lin',1,'兩小床',2,null),
  ('2026-06-27','income','住宿費', 1574,'TRIP','ZHU Qilin',1,'大床房',1,null),
  ('2026-06-27','income','住宿費', 2267,'expedia','PENG',1,'兩小床',1,null),
  ('2026-06-30','income','住宿費', 1225,'TRIP','HEN SHENG YU',1,'兩小床',1,null);

-- ---------- 收入：傭金收入（不佔房，rooms/nights 留空）----------
insert into public.entries (entry_date, direction, category, amount, channel, guest_note) values
  ('2026-06-16','income','傭金收入',840,'金豐','葉小娟'),
  ('2026-06-17','income','傭金收入',990,'金豐','許小米'),
  ('2026-06-27','income','傭金收入',490,'金豐',null);

-- ---------- 支出 ----------
insert into public.entries (entry_date, direction, category, amount, handler, memo) values
  ('2026-06-30','expense','租金支出',50000,'剛',null),
  ('2026-06-30','expense','人事成本',40000,'剛',null),
  ('2026-06-30','expense','清潔費', 10200,'剛',null),
  ('2026-06-30','expense','送洗費',  6670,'安',null),
  ('2026-06-30','expense','電費',    3403,'剛','1728+1010+665'),
  ('2026-06-30','expense','會計費用', 2800,'剛',null),
  ('2026-06-30','expense','傭金支出', 2561,'安','平台傭金'),
  ('2026-06-30','expense','廣告費',  1982,'剛',null),
  ('2026-06-30','expense','水費',    1402,'剛',null),
  ('2026-06-30','expense','網路費',   856,'剛',null),
  ('2026-06-30','expense','電信費',   259,'剛','分攤'),
  ('2026-06-30','expense','保險費用',  300,'剛',null),
  ('2026-06-30','expense','投入攤提',  300,'剛',null);

-- 多民宿版本：把上面這批示範資料都歸到「好室行旅」
-- （若你尚未執行 migration_multi_property.sql，這段會被略過而不報錯）
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='entries' and column_name='property_id') then
    update public.entries
    set property_id = (select id from public.properties where name='好室行旅' limit 1)
    where property_id is null;
  end if;
end $$;
