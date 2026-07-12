import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 專案外層存在其他 lockfile 時，明確指定本專案為輸出追蹤根目錄
  outputFileTracingRoot: __dirname,
  // Docker 用：只輸出執行所需的最小產物（server.js + 精簡 node_modules）
  output: "standalone",
};

export default nextConfig;
