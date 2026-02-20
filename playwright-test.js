const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ 
    headless: false, 
    slowMo: 500 // Slow down to watch like human
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Resolve local HTML path
  const htmlPath = path.resolve(process.cwd(), 'communication', 'index.html');
  const fileUrl = `file://${htmlPath.replace(/\\/g, '/')}`;
  
  console.log('Opening:', fileUrl);
  await page.goto(fileUrl);
  
  await page.waitForLoadState('networkidle');
  console.log('Page loaded');

  // Wait for CTA button
  await page.waitForSelector('a.cta');
  console.log('CTA buttons found');

  // Click \"Start Free Trial\" - first hero one
  const button = page.locator('header a.cta:has-text(\"Start Free Trial\")');
  await button.click({ force: true });
  console.log('Clicked \"Start Free Trial\" button!');

  // Take screenshot
  await page.screenshot({ path: 'trial-clicked.png', fullPage: true });
  console.log('Screenshot saved: trial-clicked.png');

  await page.waitForTimeout(3000); // Pause to observe
  await browser.close();
  console.log('Browser closed.');
})();
