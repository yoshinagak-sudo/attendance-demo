/**
 * 統括管理者専用 管理ダッシュボードのスクリーンショット取得
 * - PC幅 1280x800 で撮影
 * - 出力: docs/manual/screenshots/d01-* 〜 d08-*
 */
import { chromium } from "playwright";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = "https://attendance-ninau-admin.vercel.app";
const OUT = path.resolve(process.cwd(), "docs/manual/screenshots");

const SHOTS = [
  { id: "d01-dash-login", url: `${BASE}/login`, auth: false },
  { id: "d02-dash-home", url: `${BASE}/`, auth: true },
  { id: "d03-dash-monthly", url: `${BASE}/monthly`, auth: true },
  { id: "d04-dash-vehicle", url: `${BASE}/vehicle`, auth: true },
  { id: "d05-dash-pending", url: `${BASE}/pending`, auth: true },
  { id: "d06-dash-users", url: `${BASE}/users`, auth: true },
  { id: "d07-dash-overtime", url: `${BASE}/overtime`, auth: true },
  { id: "d08-dash-report", url: `${BASE}/report`, auth: true },
  { id: "d09-dash-settings-vehicle", url: `${BASE}/settings/vehicle`, auth: true },
];

function getOwnerPassword() {
  return execSync(
    'security find-generic-password -a "$USER" -s "claude-ninau-owner-password" -w',
    { shell: "/bin/bash", encoding: "utf8" },
  ).trim();
}

async function run() {
  const password = getOwnerPassword();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  // 一度だけログインしてcookieを共有
  const loginPage = await ctx.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  // login画面のスクショは先に撮る
  await loginPage.screenshot({
    path: path.join(OUT, "d01-dash-login.png"),
    fullPage: false,
  });
  console.log("[ok] d01-dash-login");

  await loginPage.fill("input[name=password]", password);
  await Promise.all([
    loginPage.waitForNavigation({ waitUntil: "networkidle" }),
    loginPage.click("button[type=submit]"),
  ]);
  await loginPage.close();

  // 認証済みコンテキストで残り
  for (const shot of SHOTS) {
    if (shot.id === "d01-dash-login") continue;
    const page = await ctx.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(OUT, `${shot.id}.png`),
      fullPage: true,
    });
    console.log(`[ok] ${shot.id}`);
    await page.close();
  }

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
