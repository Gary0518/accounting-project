# 好室行旅 — 民宿出入帳 / 訂房管理系統

取代原本的 Excel 出入帳，支援**多人同時上線、手機／電腦皆可用、資料即時同步、依民宿×能力的細粒度權限**。

## 1. 專案簡介與現況

供公司內部（約 5 人）使用的微型記帳／營運儀表板：

- **帳目輸入**：收入／支出單一表單；訂金與收款方式分開歸帳；間數（房間數 × 天數）由資料庫自動計算。
- **營業數據**：期間損益、住宿率、通路／支出結構、房型間數、年度各月損益。
- **金流數據**：各收款方式的收入／支出圓餅與淨收支。
- **權限管理**：管理員在後台勾選每人對每間民宿的三種能力（輸入帳目 / 營業數據 / 金流數據）；權限由 **PostgreSQL Row Level Security（RLS）後端強制**，非只靠前端隱藏。
- **即時同步**：任一人記帳，所有在線畫面自動刷新（Supabase Realtime）。

現況：功能完整、已可上線；資料庫 schema 與選單資料以 SQL 版控於 `supabase/`。

## 2. 技術棧

| 層 | 技術 |
|---|---|
| 前端 + 後端 | Next.js 15（App Router、Server Actions、React 19） |
| 資料庫 / 登入 / 即時同步 | Supabase（PostgreSQL + Auth + Realtime + RLS） |
| 樣式 | Tailwind CSS v4 |
| 部署 | Vercel（或本 repo 提供的 Docker） + Supabase Cloud |

## 3. 環境變數（`.env.local.example`）

複製為 `.env.local` 後填入。兩個皆為 `NEXT_PUBLIC_`，會在**建置時**內嵌進前端 bundle。

```bash
# Supabase Dashboard → Project Settings → API 取得
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```

> ℹ️ anon key 設計為可公開（真正的防線是 RLS）；但交接時仍只交付本 example，請勿附上他人的 `.env.local`，接手者應使用自己的 Supabase 專案。

## 4. 本地端開發

```bash
npm install
cp .env.local.example .env.local     # 填入你自己的 Supabase 連線

# 建立資料庫：Supabase Dashboard → SQL Editor 依序貼上執行
#   supabase/schema.sql        （建表 + RLS + 選單，必跑）
#   supabase/seed_demo.sql     （選用：載入示範資料）
# 設第一個管理員：編輯 supabase/migration_permissions.sql 末段的 email 後執行

# 建立帳號：Supabase Dashboard → Authentication → Users → Add user
npm run dev                          # http://localhost:3000
```

## 5. 容器化部署（Docker）

資料庫／登入／即時同步全由 **Supabase Cloud** 託管，故容器只需跑 Next.js 這一個服務，
**不需自架 PostgreSQL**。已提供 `Dockerfile`（多階段建置、standalone、非 root 執行）、
`docker-compose.yml`、`.dockerignore`。

前置：`next.config.mjs` 需含 `output: "standalone"`（本 repo 已設定）。

```bash
# 1. 準備 .env（compose 讀取；含上方兩個 NEXT_PUBLIC_ 變數）
cp .env.local.example .env

# 2. 建置並啟動（背景）
docker compose up -d --build

# 3. 查看日誌 / 停止
docker compose logs -f web
docker compose down
```

啟動後開 http://localhost:3000 。正式對外時於前面掛反向代理（Nginx / Caddy）綁定網域即可。

> ⚠️ `NEXT_PUBLIC_*` 是**建置期**內嵌，故 compose 已將其同時傳入 build args 與執行環境。
> 更換 Supabase 專案時需重新 `--build`，不能只重啟容器。

## 6. 專案結構

```
app/
  page.tsx            帳目輸入 + 最近帳目（登入後首頁）
  dashboard/page.tsx  營業數據（KPI + 通路 / 支出 / 房型 / 年度損益）
  cashflow/page.tsx   金流數據（收款方式圓餅 + 淨收支）
  admin/page.tsx      權限管理（僅管理員）
  login/page.tsx      Email／密碼登入
  actions.ts          Server Actions（新增／刪除帳目、登入登出、改權限）
components/
  EntryForm.tsx          收入／支出輸入表單（含即時欄位切換）
  DeleteEntryButton.tsx  刪除帳目（含二次確認）
  dashboard.tsx          圖表元件（純 HTML/CSS，零圖表套件）
  SummaryKpis.tsx        KPI 數字磚
  FilterBar.tsx          民宿 + 期間（月/年 滾輪）篩選列
  WheelPicker.tsx        iPhone 風格滾輪選擇器
  RealtimeRefresh.tsx    即時同步（訂閱 entries 異動）
  NavBar.tsx / NoAccess.tsx
lib/
  domain.ts           統計計算核心（summarize，純函式，易測）
  access.ts           權限讀取與判斷
  queries.ts          儀表板資料查詢
  supabase/           Server / Browser / middleware client
supabase/
  schema.sql              資料表 + RLS + 選單（必跑）
  migration_*.sql         逐步演進的 migration
  seed_demo.sql           示範資料（選用）
middleware.ts          全站 session 檢查，未登入導向 /login
```

## 7. 住宿率說明

`住宿率 = 總間數（已售房間夜） ÷（該民宿 total_rooms × 期間天數）`。
分母取自資料庫 `properties.total_rooms` 欄位，請依實際可售房間數維護，數字才會準確。
