#!/usr/bin/env bash
# =============================================================
# 在「VPS 上」執行：抓 GitHub 最新程式碼 → 重建 → 重啟。
#
# 平常你不用直接碰這支——Mac 上的 release.sh 會透過 SSH 幫你呼叫它。
# 但如果你是從 GitHub 網頁改的、或想在 VPS 上手動更新，就自己跑：
#     ~/accounting/scripts/deploy.sh
# =============================================================
set -euo pipefail

# 切到專案根目錄（不管從哪裡呼叫都對）
cd "$(dirname "$0")/.."

echo "==> 1/4 抓取 GitHub 最新版（main）"
git fetch origin
# reset --hard 讓 VPS 完全對齊遠端 main。
# 注意：.env 沒進版控（是未追蹤檔），這行不會動到它，Supabase 設定安全。
git reset --hard origin/main

echo "==> 2/4 重新建置並啟動（會跑幾分鐘）"
docker compose up -d --build

echo "==> 3/4 清掉沒用到的舊映像檔（省磁碟）"
docker image prune -f >/dev/null 2>&1 || true

echo "==> 4/4 目前狀態"
docker compose ps
echo "✅ VPS 更新完成"
