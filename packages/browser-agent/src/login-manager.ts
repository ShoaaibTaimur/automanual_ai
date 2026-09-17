import { Page } from 'playwright';
import { AuthDetector } from './auth-detector';
import { BrowserRunner } from './browser-runner';
import { LoginResult } from '@automanual/shared';

export interface LoginOptions {
  username?: string;
  password?: string;
  storageStatePath?: string;
}

export class LoginManager {
  private detector = new AuthDetector();

  async login(
    runner: BrowserRunner,
    page: Page,
    options: LoginOptions
  ): Promise<LoginResult> {
    try {
      const detection = await this.detector.detect(page);

      if (!detection.isAuthPage && !options.password) {
        return {
          success: true,
          redirectUrl: page.url(),
        };
      }

      const usernameSelector = detection.usernameSelector || 'input[type="email"], input[name*="user" i], input[type="text"]';
      const passwordSelector = detection.passwordSelector || 'input[type="password"]';

      // Fill username if provided
      if (options.username && await page.$(usernameSelector)) {
        await page.fill(usernameSelector, options.username);
        await page.waitForTimeout(100);
      }

      // Fill password if provided
      if (options.password && await page.$(passwordSelector)) {
        await page.fill(passwordSelector, options.password);
        await page.waitForTimeout(100);
      }

      // Click submit or press Enter
      if (detection.submitSelector && await page.$(detection.submitSelector)) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
          page.click(detection.submitSelector),
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
          page.keyboard.press('Enter'),
        ]);
      }

      await page.waitForTimeout(3000);

      // Check if still stuck on login form
      const postDetection = await this.detector.detect(page);
      if (postDetection.isAuthPage && postDetection.passwordSelector) {
        const errorElement = await page.$('.error, [role="alert"], .alert-danger, .flash-error, #flash');
        const errorText = errorElement ? await errorElement.innerText().catch(() => '') : '';
        return {
          success: false,
          redirectUrl: page.url(),
          error: errorText.trim() || 'Authentication failed: Login form still visible after submit',
        };
      }

      // Save session if storageStatePath provided
      let savedPath: string | undefined;
      if (options.storageStatePath) {
        savedPath = await runner.saveStorageState(options.storageStatePath);
      }

      return {
        success: true,
        redirectUrl: page.url(),
        storageStatePath: savedPath,
      };
    } catch (err: any) {
      return {
        success: false,
        redirectUrl: page.url(),
        error: err.message || 'Error occurred during authentication',
      };
    }
  }
}
