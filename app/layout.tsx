import type { Metadata } from "next";
import "./globals.css";
import { getSession } from "@/lib/session";
import { BottomTabBar } from "./_components/BottomTabBar";

export const metadata: Metadata = {
  title: "勤怠アプリ - 株式会社ニナウ",
  description: "株式会社ニナウ 勤怠アプリ（デモ版）",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="ja">
      <body className={session ? "has-bottom-tab-bar" : undefined}>
        {children}
        {session ? <BottomTabBar role={session.role} /> : null}
      </body>
    </html>
  );
}
