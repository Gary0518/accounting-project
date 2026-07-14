import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 專案外層存在其他 lockfile 時，明確指定本專案為輸出追蹤根目錄
  outputFileTracingRoot: __dirname,
  // Docker 用：只輸出執行所需的最小產物（server.js + 精簡 node_modules）
  output: "standalone",
  // 開發模式下允許 Cloudflare 快速隧道網域載入資源（讓外部同事可用隧道試用）
  allowedDevOrigins: ["*.trycloudflare.com"],
  // 關掉左下角的 Next.js 開發指示器（那個黑底「N」按鈕，只在開發模式出現）
  devIndicators: false,
  // exceljs 是純 Node 套件（匯入舊資料時解析 .xlsx 用），交給 Node 直接 require，
  // 不要讓 webpack 打包它——打包會壞掉。
  serverExternalPackages: ["exceljs"],
  experimental: {
    // 「匯入舊資料」是把整個 .xlsx 當表單欄位送到 server action，
    // 預設 1MB 上限對帳本檔案來說太小。
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
