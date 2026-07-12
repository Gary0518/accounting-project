import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "好室行旅 — 出入帳管理",
  description: "民宿記帳與訂房管理系統",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
