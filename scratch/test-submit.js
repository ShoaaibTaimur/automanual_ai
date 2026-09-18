const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const sessionPath = path.resolve('./storage/projects/892fad4b-4be9-4827-b4f6-64ce29124367/session.json');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('https://www.cs.commonstaging.me/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const userLoc = page.locator('input[type="email"], input[name*="email" i], input[type="text"]').first();
  const passLoc = page.locator('input[type="password"]').first();
  const submitLoc = page.locator('button[type="submit"], input[type="submit"], button:has-text("Sign in")').first();

  console.log('Filling username...');
  await userLoc.fill('shoaib.taimur@commonshare.com');
  await page.waitForTimeout(500);

  console.log('Filling password...');
  // Let's get password from project or env
  const pass = 'S@b123456';
  await passLoc.fill(pass);
  await page.waitForTimeout(500);

  console.log('Clicking submit...');
  await submitLoc.click({ force: true });
  await passLoc.press('Enter');

  console.log('Waiting up to 25s for redirect...');
  const start = Date.now();
  while (Date.now() - start < 25000) {
    await page.waitForTimeout(1000);
    console.log(`[${Math.round((Date.now() - start)/1000)}s] URL:`, page.url());
    if (!page.url().includes('login')) {
      console.log('Redirect detected!');
      break;
    }
  }

  console.log('Final URL:', page.url());
  await page.screenshot({ path: 'scratch/after-login-test.png' });

  await browser.close();
}

main().catch(console.error);
