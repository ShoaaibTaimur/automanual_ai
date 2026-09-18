const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to login...');
  await page.goto('https://www.cs.commonstaging.me/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const userLoc = page.locator('input[type="email"], input[name*="email" i], input[type="text"]').first();
  const passLoc = page.locator('input[type="password"]').first();
  const submitLoc = page.locator('button[type="submit"], input[type="submit"], button:has-text("Sign in")').first();

  console.log('Filling username...');
  await userLoc.fill('shoaib.taimur@commonshare.com');
  await page.waitForTimeout(500);

  console.log('Filling real password...');
  await passLoc.fill('warrior-PRINCE1');
  await page.waitForTimeout(500);

  const btnDisabled = await submitLoc.evaluate((b) => b.disabled);
  console.log('Button disabled after fill:', btnDisabled);

  console.log('Clicking submit...');
  await submitLoc.click({ force: true });
  await passLoc.press('Enter');

  console.log('Waiting up to 25s for redirect...');
  const start = Date.now();
  while (Date.now() - start < 25000) {
    await page.waitForTimeout(1000);
    console.log(`[${Math.round((Date.now() - start)/1000)}s] URL:`, page.url());
    if (!page.url().includes('login')) {
      console.log('Redirect detected! New URL:', page.url());
      break;
    }
  }

  await browser.close();
}

main().catch(console.error);
