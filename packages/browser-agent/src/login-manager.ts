import { Page } from 'playwright';
import { AuthDetector } from './auth-detector';
import { BrowserRunner } from './browser-runner';
import { LoginResult } from '@automanual/shared';

export interface LoginOptions {
  username?: string;
  password?: string;
  storageStatePath?: string;
}

/** Moves mouse to element, highlights it, performs action */
async function highlightAndInteract(
  page: Page,
  selector: string,
  action: 'fill' | 'click',
  value?: string
): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el || !(await el.isVisible().catch(() => false))) return false;

    const box = await el.boundingBox().catch(() => null);
    if (box) {
      const cx = Math.round(box.x + box.width / 2);
      const cy = Math.round(box.y + box.height / 2);
      await page.mouse.move(cx, cy, { steps: 12 });
      await page.waitForTimeout(150);

      await el.evaluate((node: HTMLElement) => {
        node.style.outline = '3px solid #6366f1';
        node.style.boxShadow = '0 0 12px #6366f180';
        setTimeout(() => { node.style.outline = ''; node.style.boxShadow = ''; }, 900);
      }).catch(() => {});

      await page.waitForTimeout(200);
    }

    if (action === 'fill' && value !== undefined) {
      await page.click(selector, { force: true }).catch(() => {});
      await page.waitForTimeout(100);
      await page.fill(selector, value);
    } else if (action === 'click') {
      await page.click(selector, { force: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Robust post-submit wait for both URL-based and SPA (client-side) routing.
 * Returns true when we land on a non-login page AND the login form is gone.
 */
async function waitForAuthRedirect(
  page: Page,
  originalLoginUrl: string,
  timeoutMs = 25000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const originalOrigin = (() => { try { return new URL(originalLoginUrl).origin; } catch { return ''; } })();

  let retriedSubmit = false;
  const startTime = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(600);

    const currentUrl = page.url();
    const parsed = (() => { try { return new URL(currentUrl); } catch { return null; } })();
    if (!parsed) continue;

    const urlPath = parsed.pathname;
    const urlIsLogin = /login|signin|auth|session/i.test(urlPath);
    const originChanged = parsed.origin !== originalOrigin;

    // Check if password field is still visible in DOM
    const passwordVisible = await page.evaluate(() => {
      const el = document.querySelector('input[type="password"]') as HTMLInputElement | null;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
    }).catch(() => false);

    // If still on login page after 3.5s, press Enter on password and click submit again to ensure submission
    if (!retriedSubmit && Date.now() - startTime > 3500 && (urlIsLogin || currentUrl === originalLoginUrl)) {
      retriedSubmit = true;
      try {
        const pass = page.locator('input[type="password"]').first();
        if (await pass.isVisible().catch(() => false)) {
          await pass.press('Enter').catch(() => {});
        }
        const subBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await subBtn.isVisible().catch(() => false)) {
          await subBtn.click().catch(() => {});
        }
      } catch {}
    }

    // Success 1: Subdomain or domain changed (e.g. www.cs... -> dashboard.cs...)
    if (originChanged && !urlIsLogin) {
      return true;
    }

    // Success 2: URL changed away from login AND password field gone
    if (!urlIsLogin && !passwordVisible) {
      return true;
    }

    // Success 3: URL changed away from original login URL and doesn't contain login keywords
    if (currentUrl !== originalLoginUrl && !urlIsLogin) {
      return true;
    }
  }

  // Final check at deadline: if we're not on original login URL and not on a login path
  try {
    const endUrl = page.url();
    if (endUrl !== originalLoginUrl && !/login|signin|auth/i.test(new URL(endUrl).pathname)) {
      return true;
    }
  } catch {}

  return false;
}

export class LoginManager {
  private detector = new AuthDetector();

  async login(
    runner: BrowserRunner,
    page: Page,
    options: LoginOptions
  ): Promise<LoginResult> {
    try {
      let preLoginUrl = page.url();
      let detection = await this.detector.detect(page);

      // If credentials provided but not yet on an auth page, wait up to 4s for auth redirect / form mount
      if (!detection.isAuthPage && options.password) {
        console.log('[LoginManager] Waiting 3s for login form or client-side redirect to settle...');
        await page.waitForTimeout(3000);
        detection = await this.detector.detect(page);
        preLoginUrl = page.url();
      }

      console.log(`[LoginManager] Auth detection: isAuthPage=${detection.isAuthPage}, usernameSelector=${detection.usernameSelector}, passwordSelector=${detection.passwordSelector}, submitSelector=${detection.submitSelector}`);

      if (!detection.isAuthPage && !options.password) {
        console.log('[LoginManager] No auth page detected and no credentials — skipping login.');
        return { success: true, redirectUrl: preLoginUrl };
      }

      if (!detection.isAuthPage && options.password) {
        console.warn('[LoginManager] Credentials provided but no login form detected on current page. Attempting anyway.');
      }

      const usernameSelector =
        detection.usernameSelector ||
        'input[type="email"], input[name*="user" i], input[type="text"]';
      const passwordSelector =
        detection.passwordSelector || 'input[type="password"]';

      // Fill username
      if (options.username) {
        const ok = await highlightAndInteract(page, usernameSelector, 'fill', options.username);
        console.log(`[LoginManager] Username fill: ${ok ? 'ok' : 'element not found'}`);
        await page.waitForTimeout(400);
      }

      // Fill password
      if (options.password) {
        const ok = await highlightAndInteract(page, passwordSelector, 'fill', options.password);
        console.log(`[LoginManager] Password fill: ${ok ? 'ok' : 'element not found'}`);
        await page.waitForTimeout(400);
      }

      // Pause so recording shows filled form
      await page.waitForTimeout(800);

      // Click submit or press Enter
      let submitted = false;
      if (detection.submitSelector) {
        submitted = await highlightAndInteract(page, detection.submitSelector, 'click');
        console.log(`[LoginManager] Submit button click: ${submitted ? 'ok' : 'not found — trying Enter'}`);
      }

      if (!submitted) {
        // Highlight password field before Enter
        const passEl = await page.$('input[type="password"]');
        if (passEl) {
          await passEl.evaluate((node: HTMLElement) => {
            node.style.outline = '3px solid #6366f1';
            setTimeout(() => { node.style.outline = ''; }, 800);
          }).catch(() => {});
        }
        await page.keyboard.press('Enter');
        console.log('[LoginManager] Pressed Enter to submit.');
      }

      // Wait for redirect / DOM change
      let loggedIn = await waitForAuthRedirect(page, preLoginUrl, 25000);
      console.log(`[LoginManager] Post-submit auth check: loggedIn=${loggedIn}, url=${page.url()}`);

      // Check current page URL: if we're on a dashboard or non-login URL, login succeeded!
      const currentUrl = page.url();
      const currentPath = (() => { try { return new URL(currentUrl).pathname; } catch { return ''; } })();
      const isLoginPath = /login|signin|auth/i.test(currentPath);

      if (!isLoginPath && currentUrl !== preLoginUrl) {
        console.log(`[LoginManager] Confirmed post-login URL: ${currentUrl}`);
        loggedIn = true;
      }

      if (!loggedIn) {
        // Only inspect errors scoped to the login form
        const errorEl = await page.$('form .error, form .alert-danger, form .text-rose-500, form .text-red-500, form [role="alert"]');
        const errorText = errorEl ? await errorEl.innerText().catch(() => '') : '';
        return {
          success: false,
          redirectUrl: page.url(),
          error: errorText.trim() || 'Login form still visible after submit — check credentials',
        };
      }

      // Extra settle for SPA hydration
      await page.waitForTimeout(3000);
      console.log(`[LoginManager] Final URL after login: ${page.url()}`);

      // Save authenticated session
      let savedPath: string | undefined;
      if (options.storageStatePath) {
        try {
          savedPath = await runner.saveStorageState(options.storageStatePath);
          const fileExists = require('fs').existsSync(savedPath);
          console.log(`[LoginManager] Session saved to ${savedPath} (exists: ${fileExists})`);
          if (!fileExists) savedPath = undefined;
        } catch (saveErr: any) {
          console.error(`[LoginManager] Failed to save session: ${saveErr.message}`);
          savedPath = undefined;
        }
      }

      return {
        success: true,
        redirectUrl: page.url(),
        storageStatePath: savedPath,
      };
    } catch (err: any) {
      console.error(`[LoginManager] Login threw: ${err.message}`);
      return {
        success: false,
        redirectUrl: page.url(),
        error: err.message || 'Error during authentication',
      };
    }
  }
}
