const { chromium } = require('playwright');
const path = require('path');

const HTML = path.join(__dirname, '..', 'docs', 'manual', 'manual.html');
const PDF = path.join(__dirname, '..', 'docs', 'manual', 'ニナウ勤怠アプリ_マニュアル.pdf');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('file://' + HTML, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // フォント・画像ロード待ち

  await page.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  console.log('PDF generated:', PDF);
  await browser.close();
})();
