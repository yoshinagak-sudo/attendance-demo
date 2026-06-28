/**
 * 追加機能のスクリーンショット取得
 * - /login (新規登録リンク + LINE ボタン明示済み)
 * - /signup
 * - /signup/line (pending cookie をセットして表示)
 * - /settings/account (manager で session)
 * - /improvements
 * - /admin/improvements
 *
 * 本番URL: https://attendance-demo-dun.vercel.app
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = process.env.MANUAL_BASE_URL || "https://attendance-demo-dun.vercel.app";
const OUT = path.resolve(process.cwd(), "docs/manual/screenshots");

// 既存スクショの命名規約: 2桁番号-name.png
const SHOTS = [
  {
    id: "26-signup",
    url: `${BASE}/signup`,
    viewport: { width: 390, height: 844 }, // モバイル
    auth: null,
  },
  {
    id: "27-signup-line",
    url: `${BASE}/signup/line`,
    viewport: { width: 390, height: 844 },
    auth: null,
    // pending cookie をセット
    preCookies: [
      {
        name: "line_pending_signup",
        value: JSON.stringify({
          lineUserId: "U_demo_for_manual",
          displayName: "Keigo Yoshinaga",
          picture: null,
        }),
        domain: ".attendance-demo-dun.vercel.app",
        path: "/",
      },
    ],
  },
  {
    id: "28-settings-account",
    url: `${BASE}/settings/account`,
    viewport: { width: 390, height: 844 },
    auth: "manager",
  },
  {
    id: "29-improvements",
    url: `${BASE}/improvements`,
    viewport: { width: 390, height: 844 },
    auth: "member",
  },
  {
    id: "30-admin-improvements",
    url: `${BASE}/admin/improvements`,
    viewport: { width: 1280, height: 800 },
    auth: "manager",
  },
  {
    id: "01-login",
    url: `${BASE}/login`,
    viewport: { width: 390, height: 844 },
    auth: null,
    // 既存を上書き（LINEボタン+新規登録リンク追加版に差し替え）
  },
];

const CREDS = {
  manager: {
    loginId: "ai@smart-media.co.jp",
    password: "password123",
  },
  member: {
    loginId: "sawano_yamato@ninau.jp",
    password: "password123",
  },
};

async function loginViaApi(context, role) {
  const cred = CREDS[role];
  if (!cred) return;
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: cred,
    headers: { "content-type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(`login(${role}) failed: ${res.status()}`);
  }
}

async function run() {
  const browser = await chromium.launch();
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: 2,
    });
    if (shot.preCookies) {
      await context.addCookies(shot.preCookies);
    }
    if (shot.auth) {
      await loginViaApi(context, shot.auth);
    }
    const page = await context.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const outPath = path.join(OUT, `${shot.id}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`[ok] ${shot.id} -> ${outPath}`);
    await context.close();
  }
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
