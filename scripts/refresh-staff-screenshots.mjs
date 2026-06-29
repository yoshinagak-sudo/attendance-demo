/**
 * 社員アプリ側のスクショ再取得（UI変更を反映）
 * 主に admin/users はロール切替セレクト追加、login は LINE ボタン追加など
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = "https://attendance-demo-dun.vercel.app";
const OUT = path.resolve(process.cwd(), "docs/manual/screenshots");

const CREDS = {
  manager: { loginId: "ai@smart-media.co.jp", password: "password123" },
};

async function login(context, role) {
  const c = CREDS[role];
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: c,
    headers: { "content-type": "application/json" },
  });
  if (!res.ok()) throw new Error(`login fail ${res.status()}`);
}

const SHOTS = [
  // モバイル幅 = 社員側 UI 確認
  { id: "01-login", url: `${BASE}/login`, viewport: { width: 390, height: 844 }, auth: null },
  { id: "26-signup", url: `${BASE}/signup`, viewport: { width: 390, height: 844 }, auth: null },
  // PC幅 = 管理画面
  { id: "11-admin-desktop", url: `${BASE}/admin`, viewport: { width: 1280, height: 800 }, auth: "manager" },
  { id: "09-admin-users", url: `${BASE}/admin/users`, viewport: { width: 1280, height: 800 }, auth: "manager" },
  { id: "12-admin-overtime-desktop", url: `${BASE}/admin/overtime`, viewport: { width: 1280, height: 800 }, auth: "manager" },
  { id: "13-admin-report-desktop", url: `${BASE}/admin/report`, viewport: { width: 1280, height: 800 }, auth: "manager" },
  { id: "19-admin-vehicle", url: `${BASE}/admin/vehicle`, viewport: { width: 1280, height: 800 }, auth: "manager" },
  // モバイル幅 = 社員アプリ
  { id: "28-settings-account", url: `${BASE}/settings/account`, viewport: { width: 390, height: 844 }, auth: "manager" },
];

async function run() {
  const browser = await chromium.launch();
  for (const s of SHOTS) {
    const context = await browser.newContext({
      viewport: s.viewport,
      deviceScaleFactor: 2,
    });
    if (s.auth) await login(context, s.auth);
    const page = await context.newPage();
    await page.goto(s.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `${s.id}.png`), fullPage: true });
    console.log(`[ok] ${s.id}`);
    await context.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
