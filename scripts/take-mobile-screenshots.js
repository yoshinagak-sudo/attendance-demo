// ニナウさん商談前のスマホスクショ撮影
// 使い方: node scripts/take-mobile-screenshots.js
// 既存の dev server (http://localhost:3000) を利用、demoモードでログインを切替える前提

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'http://localhost:3000';
const OUT_DIR = process.env.OUT_DIR || '/tmp/ninau-mobile-after';

const MOBILE_VP = { width: 390, height: 844 }; // iPhone 14 Pro
const SE_VP = { width: 375, height: 667 };    // iPhone SE
const DESKTOP_VP = { width: 1440, height: 900 };

// quick login で manager / member を切替える
const PAGES = [
  // 未ログイン (ログイン画面)
  { name: 'login', path: '/login', login: null, fullPage: true, waitMs: 600 },

  // manager 視点
  { name: 'admin', path: '/admin', login: 'manager', fullPage: true, waitMs: 1500 },
  { name: 'admin-overtime', path: '/admin/overtime', login: 'manager', fullPage: true, waitMs: 1000 },
  { name: 'admin-report', path: '/admin/overtime/report', login: 'manager', fullPage: true, waitMs: 1000 },
  { name: 'admin-users', path: '/admin/users', login: 'manager', fullPage: true, waitMs: 800 },

  // member 視点
  { name: 'punch', path: '/', login: 'member', fullPage: true, waitMs: 1500 },
  { name: 'overtime', path: '/overtime', login: 'member', fullPage: true, waitMs: 800 },
  { name: 'overtime-new', path: '/overtime/new', login: 'member', fullPage: true, waitMs: 800 },
];

async function ensureLogin(ctx, role) {
  // role: 'manager' | 'member' | null
  if (!role) {
    await ctx.clearCookies();
    return;
  }
  await ctx.clearCookies();
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // QuickLogin: button text 「課長」「現場社員」「代表取締役」「蛸と衣 社員」
  const labelMap = {
    manager: ['代表取締役', '課長'],
    member: ['現場社員'],
  };
  const labels = labelMap[role] || labelMap.member;
  for (const lbl of labels) {
    const btn = page.locator(`button:has-text("${lbl}")`).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.close();
      return;
    }
  }
  await page.close();
}

async function shoot(ctx, page, p, suffix = '') {
  const url = `${BASE_URL}${p.path}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(p.waitMs || 500);
  // Next.js dev badge (左下の N アイコン) を隠す: 純粋な UI を撮影するため
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-toolbar],
      #__next-build-watcher { display: none !important; }
    `,
  }).catch(() => {});
  const file = path.join(OUT_DIR, `${p.name}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: !!p.fullPage });
  console.log(`  ✓ ${path.basename(file)}`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[base] ${BASE_URL}`);
  console.log(`[out]  ${OUT_DIR}`);

  const browser = await chromium.launch();

  // iPhone 14 Pro
  const mobileCtx = await browser.newContext({
    viewport: MOBILE_VP,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  // iPhone SE
  const seCtx = await browser.newContext({
    viewport: SE_VP,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  // Desktop (回帰チェック用)
  const desktopCtx = await browser.newContext({
    viewport: DESKTOP_VP,
    deviceScaleFactor: 1,
  });

  // 各コンテキストごとに login 切替を効率化（managerとmemberの順で撮る）
  for (const ctxInfo of [
    { ctx: mobileCtx, suffix: '' },
    { ctx: seCtx, suffix: '-se' },
  ]) {
    let lastLogin = '__none__';
    for (const p of PAGES) {
      if (p.login !== lastLogin) {
        await ensureLogin(ctxInfo.ctx, p.login);
        lastLogin = p.login;
      }
      const page = await ctxInfo.ctx.newPage();
      try {
        await shoot(ctxInfo.ctx, page, p, ctxInfo.suffix);
      } catch (e) {
        console.error(`  ✗ ${p.name}${ctxInfo.suffix}: ${e.message}`);
      } finally {
        await page.close();
      }
    }
  }

  // Desktop 回帰: admin / overtime/new だけ
  {
    let lastLogin = '__none__';
    for (const p of PAGES.filter(p => ['admin', 'admin-overtime', 'overtime-new'].includes(p.name))) {
      if (p.login !== lastLogin) {
        await ensureLogin(desktopCtx, p.login);
        lastLogin = p.login;
      }
      const page = await desktopCtx.newPage();
      try {
        await shoot(desktopCtx, page, p, '-desktop');
      } catch (e) {
        console.error(`  ✗ ${p.name}-desktop: ${e.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await mobileCtx.close();
  await seCtx.close();
  await desktopCtx.close();
  await browser.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
