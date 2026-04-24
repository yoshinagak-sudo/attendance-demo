import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "勤怠打刻デモ",
  description: "勤怠アプリ デモ版",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
