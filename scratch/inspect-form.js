const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.cs.commonstaging.me/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const formInfo = await page.evaluate(() => {
    const email = document.querySelector('input[type="email"], input[type="text"]');
    const pass = document.querySelector('input[type="password"]');
    const btn = document.querySelector('button[type="submit"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Login'));

    return {
      emailTag: email ? email.tagName : null,
      emailOuter: email ? email.outerHTML : null,
      passOuter: pass ? pass.outerHTML : null,
      btnOuter: btn ? btn.outerHTML : null,
      btnType: btn ? btn.type : null,
      formOuter: btn && btn.closest('form') ? btn.closest('form').outerHTML.slice(0, 300) : 'no form element',
    };
  });

  console.log(JSON.stringify(formInfo, null, 2));
  await browser.close();
}

main().catch(console.error);
