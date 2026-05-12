const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://attendance-demo-dun.vercel.app';
const OUT = path.join(__dirname, '..', 'docs', 'manual', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1' };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };

async function login(page, loginId) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const targetUrl = (await page.evaluate(async (id) => {
    const res = await fetch('/api/auth/demo-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId: id }) });
    const j = await res.json();
    return j?.user?.role === 'manager' ? '/admin' : '/';
  }, loginId));
  await page.goto(BASE + targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

async function shot(page, name, full = true) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: full });
  console.log('✓', name);
}

(async () => {
  const browser = await chromium.launch();

  // === モバイル: member視点 ===
  const memCtx = await browser.newContext(MOBILE);
  let page = await memCtx.newPage();
  // 1. ログイン画面
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '01-login');

  // sawanoでログイン
  await login(page, 'sawano');
  // 2. 打刻画面 (退勤済)
  await shot(page, '02-punch');

  // 3. 残業申請履歴
  await page.goto(BASE + '/overtime', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '03-overtime');

  // 4. 新規申請フォーム
  await page.goto(BASE + '/overtime/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '04-overtime-new');

  // 5. ユーザーメニュー展開（デモ切替が見える状態）
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('details.user-menu summary');
  await page.waitForTimeout(600);
  await shot(page, '05-user-menu', false);

  // === モバイル: manager視点 ===
  const mgrCtx = await browser.newContext(MOBILE);
  page = await mgrCtx.newPage();
  await login(page, 'takayama');
  // 6. 勤怠ダッシュボード (admin)
  await shot(page, '06-admin');

  // 7. 残業承認キュー（モバイルカード）
  await page.goto(BASE + '/admin/overtime', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '07-admin-overtime');

  // 8. 月次レポート
  await page.goto(BASE + '/admin/overtime/report', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '08-admin-report');

  // 9. ユーザー管理
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '09-admin-users');

  // 10. 設定
  await page.goto(BASE + '/admin/settings/overtime', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '10-admin-settings');

  // === デスクトップ: manager視点（ガント+全体図）===
  const deskCtx = await browser.newContext(DESKTOP);
  page = await deskCtx.newPage();
  await login(page, 'takayama');
  await shot(page, '11-admin-desktop');

  await page.goto(BASE + '/admin/overtime', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '12-admin-overtime-desktop');

  await page.goto(BASE + '/admin/overtime/report', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '13-admin-report-desktop');

  await browser.close();
  console.log('done');
})();
