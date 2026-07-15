#!/usr/bin/env bash
# =============================================================
# 在「你的 Mac 上」執行：把改動送上 GitHub，並自動叫 VPS 更新網站。
#
# 用法：
#     ./scripts/release.sh "這次改了什麼"
#
# 它會做三件事：
#   1. 把你所有改動 commit 並 push 到 GitHub 的 main
#   2. SSH 進 VPS，執行 deploy.sh（抓最新 → 重建 → 重啟）
#   3. 檢查網站有沒有正常回應
#
# VPS 位址／路徑可用環境變數覆蓋，例如換機器時：
#     VPS=ubuntu@1.2.3.4 ./scripts/release.sh "訊息"
# =============================================================
set -euo pipefail

VPS="${VPS:-ubuntu@51.222.26.170}"   # SSH 目標
APP_DIR="${APP_DIR:-accounting}"     # VPS 上的專案資料夾（相對於登入家目錄）
SITE="${SITE:-https://house.gokinmen.tw}"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "用法：./scripts/release.sh \"這次改了什麼\""
  echo "（訊息會變成這次 commit 的說明，之後在 GitHub 上看得到）"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> 1/3 送上 GitHub"
git add -A
if git diff --cached --quiet; then
  echo "    （沒有新的改動，跳過 commit，直接重新部署現有版本）"
else
  git commit -m "$MSG"
fi
git push origin main

echo "==> 2/3 通知 VPS 更新（可能會問你 VPS 密碼）"
ssh "$VPS" "cd ~/$APP_DIR && ./scripts/deploy.sh"

echo "==> 3/3 檢查網站"
sleep 3
code=$(curl -sS -o /dev/null -w "%{http_code}" "$SITE/login" || echo "000")
echo "    $SITE/login -> HTTP $code"
if [ "$code" = "200" ]; then
  echo "✅ 全部完成，網站正常"
else
  echo "⚠️  網站回應是 $code（不是 200）。可能還在重啟，等 30 秒再開一次網頁；"
  echo "    若持續異常，到 VPS 跑：docker compose logs --tail=30 web"
fi
