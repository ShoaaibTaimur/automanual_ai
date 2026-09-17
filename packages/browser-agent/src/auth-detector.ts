import { Page } from 'playwright';
import { AuthDetectionResult } from '@automanual/shared';

export class AuthDetector {
  async detect(page: Page): Promise<AuthDetectionResult> {
    const pageTitle = await page.title().catch(() => '');
    const currentUrl = page.url();

    // Check for password inputs first
    const passwordInputs = await page.$$('input[type="password"]');
    const hasPasswordInput = passwordInputs.length > 0;

    // Check for username/email inputs
    const usernameSelectors = [
      'input[type="email"]',
      'input[name*="user" i]',
      'input[name*="email" i]',
      'input[name*="login" i]',
      'input[id*="user" i]',
      'input[id*="email" i]',
      'input[id*="login" i]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
    ];

    let foundUsernameSelector: string | undefined;
    for (const sel of usernameSelectors) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        foundUsernameSelector = sel;
        break;
      }
    }

    // Check submit buttons
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button:has-text("Signin")',
      'button:has-text("Submit")',
      'button:has-text("Continue")',
    ];

    let foundSubmitSelector: string | undefined;
    for (const sel of submitSelectors) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        foundSubmitSelector = sel;
        break;
      }
    }

    const isUrlAuthLike = /login|signin|auth|session/i.test(currentUrl);
    const isTitleAuthLike = /login|sign in|auth/i.test(pageTitle);

    const isAuthPage = hasPasswordInput || (isUrlAuthLike && !!foundUsernameSelector);

    return {
      isAuthPage,
      usernameSelector: foundUsernameSelector,
      passwordSelector: hasPasswordInput ? 'input[type="password"]' : undefined,
      submitSelector: foundSubmitSelector,
      formType: isAuthPage ? 'login' : 'unknown',
      pageTitle,
    };
  }
}
