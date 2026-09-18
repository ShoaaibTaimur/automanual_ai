const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const sessionPath = path.resolve('./storage/projects/892fad4b-4be9-4827-b4f6-64ce29124367/session.json');
  console.log('Session exists:', fs.existsSync(sessionPath));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  console.log('Navigating to login with session...');
  await page.goto('https://www.cs.commonstaging.me/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Page URL after 3s:', page.url());

  const userLoc = page.locator('input[type="email"], input[type="text"]').first();
  const passLoc = page.locator('input[type="password"]').first();
  const isUserVis = await userLoc.isVisible().catch(() => false);
  const isPassVis = await passLoc.isVisible().catch(() => false);
  console.log('Is user input visible:', isUserVis, 'Is pass visible:', isPassVis);

  console.log('Navigating directly to https://dashboard.cs.commonstaging.me/...');
  await page.goto('https://dashboard.cs.commonstaging.me/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('Dashboard URL after 5s:', page.url());

  await browser.close();
}

main().catch(console.error);
