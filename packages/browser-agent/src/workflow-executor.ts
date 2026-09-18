import { Page } from 'playwright';
import { BrowserRunner } from './browser-runner';
import { EventLogger } from './event-logger';
import { SafetyGuard } from './safety-guard';
import { ScreenshotCapture } from './screenshot-capture';
import { ExplorationPlan, InteractionEvent, WorkflowPlanItem, WorkflowStep } from '@automanual/shared';
import * as path from 'path';
import * as fs from 'fs';

export interface ExecuteOptions {
  storageDir: string;
  storageStatePath?: string;
  maxWorkflows?: number;
  auth?: {
    loginUrl: string;
    username: string;
    password: string;
  };
}

export interface ExecutionResult {
  videoPath: string;
  eventsPath: string;
  durationSeconds: number;
  events: InteractionEvent[];
  skippedActions: { action: string; target?: string; reason: string }[];
}

export class WorkflowExecutor {
  private safetyGuard = new SafetyGuard();
  private eventLogger = new EventLogger();
  private screenshotCapture = new ScreenshotCapture();

  async executePlan(
    plan: ExplorationPlan,
    baseUrl: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    const recordingsDir = path.join(options.storageDir, 'recordings');
    const screenshotsDir = path.join(options.storageDir, 'screenshots');
    const eventsPath = path.join(options.storageDir, 'events.json');

    fs.mkdirSync(recordingsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });

    this.eventLogger.reset();
    const skippedActions: { action: string; target?: string; reason: string }[] = [];

    const runner = new BrowserRunner();
    const page = await runner.launch({
      viewport: { width: 1920, height: 1080 },
      recordVideoDir: recordingsDir,
      storageStatePath: options.storageStatePath && fs.existsSync(options.storageStatePath) ? options.storageStatePath : undefined,
      slowMo: 150,
    });

    // Auto-close any newly opened tabs/popups so recording stays focused on primary manual
    page.context().on('page', async (popup) => {
      try {
        console.log(`[WorkflowExecutor] Popup tab opened (${popup.url()}). Closing to preserve recording focus.`);
        await popup.close().catch(() => {});
      } catch {}
    });

    // Inject visible animated mouse cursor element so Playwright video recording captures cursor
    await page.addInitScript(() => {
      const cursor = document.createElement('div');
      cursor.id = '__automanual_cursor';
      cursor.style.position = 'fixed';
      cursor.style.top = '0';
      cursor.style.left = '0';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '2147483647';
      cursor.style.transform = 'translate(-100px, -100px)';
      cursor.style.transition = 'transform 0.05s ease-out';
      cursor.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#6366f1" stroke="white" stroke-width="1.5" style="filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6));">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        </svg>
      `;

      const attach = () => {
        if (!document.getElementById('__automanual_cursor') && document.body) {
          document.body.appendChild(cursor);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
      } else {
        attach();
      }

      window.addEventListener('mousemove', (e) => {
        attach();
        cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      });

      window.addEventListener('mousedown', () => {
        attach();
        cursor.style.transform += ' scale(0.8)';
      });

      window.addEventListener('mouseup', () => {
        attach();
      });
    });

    let effectiveBaseUrl = baseUrl;
    if (/login|signin/i.test(effectiveBaseUrl)) {
      try {
        const u = new URL(effectiveBaseUrl);
        effectiveBaseUrl = u.origin;
      } catch {}
    }

    try {
      if (options.auth) {
        // ── Phase 0: Live Recorded Authentication ──────────────────────────
        console.log(`[WorkflowExecutor] Recording live login at: ${options.auth.loginUrl}`);
        await page.goto(options.auth.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(3000);
        await page.mouse.move(960, 540, { steps: 8 });

        this.eventLogger.logEvent({
          type: 'navigate',
          url: page.url(),
          elementText: 'Navigate to Sign In Portal',
          workflowId: 'login-authentication',
        });

        // Fill username / email field
        const userLoc = page
          .locator(
            'input[type="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i], input[id*="user" i], input[type="text"]'
          )
          .first();

        if (await userLoc.isVisible().catch(() => false)) {
          await userLoc
            .evaluate((el: HTMLElement) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
            .catch(() => {});
          await page.waitForTimeout(300);

          const box = await userLoc.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), { steps: 14 });
            await page.waitForTimeout(200);

            await userLoc.evaluate((el: HTMLElement) => {
              el.style.outline = '3px solid #6366f1';
              el.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.7)';
              setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 900);
            }).catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(80);
            await page.mouse.up();
          }

          await userLoc.click({ force: true }).catch(() => {});
          await userLoc.fill(options.auth.username).catch(() => {});
          await userLoc.dispatchEvent('input').catch(() => {});
          await userLoc.dispatchEvent('change').catch(() => {});

          this.eventLogger.logEvent({
            type: 'input',
            url: page.url(),
            elementText: `Enter account credentials ${options.auth.username}`,
            inputValue: options.auth.username,
            workflowId: 'login-authentication',
          });
          await page.waitForTimeout(1000);
        }

        // Fill password field
        const passLoc = page.locator('input[type="password"]').first();
        if (await passLoc.isVisible().catch(() => false)) {
          const box = await passLoc.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), { steps: 14 });
            await page.waitForTimeout(200);

            await passLoc.evaluate((el: HTMLElement) => {
              el.style.outline = '3px solid #6366f1';
              el.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.7)';
              setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 900);
            }).catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(80);
            await page.mouse.up();
          }

          await passLoc.click({ force: true }).catch(() => {});
          await passLoc.fill(options.auth.password).catch(() => {});
          await passLoc.dispatchEvent('input').catch(() => {});
          await passLoc.dispatchEvent('change').catch(() => {});

          this.eventLogger.logEvent({
            type: 'input',
            url: page.url(),
            elementText: 'Enter account password',
            inputValue: '••••••••',
            workflowId: 'login-authentication',
          });
          await page.waitForTimeout(800);
        }

        // Click submit / sign in button
        const submitLoc = page
          .locator(
            'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")'
          )
          .first();

        if (await submitLoc.isVisible().catch(() => false)) {
          const box = await submitLoc.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), { steps: 14 });
            await page.waitForTimeout(200);

            await submitLoc
              .evaluate((el: HTMLElement) => {
                el.style.outline = '3px solid #6366f1';
                el.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.7)';
                setTimeout(() => {
                  el.style.outline = '';
                  el.style.boxShadow = '';
                }, 1200);
              })
              .catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.up();
          }

          // Force form submission via submit click and Enter keypress on password
          await submitLoc.click({ force: true }).catch(() => {});
          const passInput = page.locator('input[type="password"]').first();
          if (await passInput.isVisible().catch(() => false)) {
            await passInput.press('Enter').catch(() => {});
          }

          this.eventLogger.logEvent({
            type: 'click',
            url: page.url(),
            elementText: 'Submit Sign In authentication',
            workflowId: 'login-authentication',
          });

          // Wait for redirect to dashboard with retry
          console.log('[WorkflowExecutor] Waiting for post-login redirect to dashboard...');
          const authDeadline = Date.now() + 30000;
          let retriedSubmit = false;
          let loggedIn = false;
          const initialLoginUrl = page.url();

          while (Date.now() < authDeadline) {
            await page.waitForTimeout(600);
            const cur = page.url();
            const curPath = (() => { try { return new URL(cur).pathname; } catch { return ''; } })();
            const isLogin = /login|signin|auth/i.test(curPath);

            // Check if password field is still visible in DOM
            const passwordVisible = await page.evaluate(() => {
              const el = document.querySelector('input[type="password"]') as HTMLInputElement | null;
              if (!el) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            }).catch(() => false);

            if (!isLogin && cur !== initialLoginUrl) {
              loggedIn = true;
              break;
            }

            if (!isLogin && !passwordVisible) {
              loggedIn = true;
              break;
            }

            // If still on login page after 4s, re-trigger Enter & submit click
            if (!retriedSubmit && Date.now() - (authDeadline - 30000) > 4000) {
              retriedSubmit = true;
              console.log('[WorkflowExecutor] Re-triggering Enter and submit click...');
              try {
                const p = page.locator('input[type="password"]').first();
                if (await p.isVisible().catch(() => false)) {
                  await p.press('Enter').catch(() => {});
                }
                const b = page.locator('button[type="submit"], input[type="submit"]').first();
                if (await b.isVisible().catch(() => false)) {
                  await b.click({ force: true }).catch(() => {});
                }
              } catch {}
            }
          }

          await page.waitForTimeout(3000);
          console.log(`[WorkflowExecutor] Current URL after login wait: ${page.url()}`);

          if (loggedIn || !/login|signin/i.test(page.url())) {
            effectiveBaseUrl = page.url();
            console.log(`[WorkflowExecutor] Successfully authenticated. Effective base URL: ${effectiveBaseUrl}`);
            if (options.storageStatePath) {
              await page.context().storageState({ path: options.storageStatePath }).catch(() => {});
            }
          } else {
            console.warn(`[WorkflowExecutor] Redirect did not occur automatically. Navigating to ${effectiveBaseUrl}...`);
            await page.goto(effectiveBaseUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
            await page.waitForTimeout(3500);
            if (!/login|signin/i.test(page.url())) {
              effectiveBaseUrl = page.url();
              if (options.storageStatePath) {
                await page.context().storageState({ path: options.storageStatePath }).catch(() => {});
              }
            }
          }
        }

        this.eventLogger.logEvent({
          type: 'navigate',
          url: page.url(),
          elementText: 'Authenticated and redirected to Dashboard',
          workflowId: 'login-authentication',
        });
      } else {
        // Initial landing navigation without auth
        await page.goto(effectiveBaseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(4000); // wait for SPA hydration
        await page.mouse.move(960, 540, { steps: 5 });

        this.eventLogger.logEvent({
          type: 'navigate',
          url: page.url(),
          elementText: 'Application loaded',
        });
      }

      const maxWorkflows = options.maxWorkflows || plan.workflows.length;
      // If live auth was recorded above, skip redundant login workflow execution
      const workflowsToRun = plan.workflows
        .filter((w) => (options.auth ? !/login|auth|sign-in/i.test(w.id) && !/sign in|log in|login/i.test(w.title) : true))
        .slice(0, maxWorkflows);

      const appOrigin = new URL(effectiveBaseUrl).origin;

      for (const workflow of workflowsToRun) {
        console.log(`Executing workflow: [Priority ${workflow.priority}] ${workflow.title}`);

        // Guard: if browser previously drifted off-origin, return to app base immediately
        const currentOrigin = (() => {
          try { return new URL(page.url()).origin; } catch { return ''; }
        })();
        if (currentOrigin !== appOrigin || /policies|terms|privacy/i.test(page.url())) {
          console.log(`[WorkflowExecutor] Browser off-origin (${page.url()}). Returning to ${effectiveBaseUrl}...`);
          await page.goto(effectiveBaseUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        // Smoothly ensure we start each workflow from the top of the page in full view
        await page.evaluate(() => {
          if (window.scrollY > 40) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }).catch(() => {});
        await page.waitForTimeout(400);

        for (const step of workflow.steps) {
          // Safety verification
          const safety = this.safetyGuard.checkAction(step.action, step.target, step.description);
          if (!safety.isSafe) {
            console.warn(`[SAFETY] ${safety.reason} (${step.action} -> ${step.target})`);
            skippedActions.push({
              action: step.action,
              target: step.target,
              reason: safety.reason || 'Destructive action blocked',
            });
            continue;
          }

          await this.executeStep(page, effectiveBaseUrl, step, screenshotsDir, workflow.id);
        }
      }

      // Concluding hold to let final video frames settle
      await page.waitForTimeout(2000);

      // Save raw video path before closing
      const videoHandle = page.video();
      let rawVideoPath = '';
      if (videoHandle) {
        rawVideoPath = await videoHandle.path().catch(() => '');
      }

      await runner.close();

      // Wait a moment for video writer to flush
      await new Promise(r => setTimeout(r, 1000));

      // Save events to JSON
      this.eventLogger.saveToFile(eventsPath);
      const events = this.eventLogger.getEvents();
      const durationSeconds = this.eventLogger.getDurationSeconds();

      return {
        videoPath: rawVideoPath,
        eventsPath,
        durationSeconds,
        events,
        skippedActions,
      };
    } catch (err: any) {
      await runner.close();
      throw err;
    }
  }

  private safeResolveUrl(target: string | undefined, currentUrl: string, baseUrl: string) {
    const baseOrigin = (() => {
      try { return new URL(baseUrl).origin; } catch { return 'http://localhost'; }
    })();

    // Disallow external legal/policy/terms pages from hijacking user manual
    if (target && /policies|terms|privacy|cookie|legal/i.test(target)) {
      return { targetUrl: baseUrl, targetPath: '/', cleanLabel: 'Dashboard' };
    }

    const currentOrigin = (() => {
      try {
        const u = new URL(currentUrl);
        return currentUrl && currentUrl !== 'about:blank' && u.origin === baseOrigin && !/policies|terms|privacy/i.test(u.pathname)
          ? u.origin
          : baseOrigin;
      } catch {
        return baseOrigin;
      }
    })();

    if (!target || target.trim().length === 0) {
      return { targetUrl: currentOrigin + '/', targetPath: '/', cleanLabel: '' };
    }

    const trimmed = target.trim();

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const u = new URL(trimmed);
        if (u.origin !== baseOrigin && !u.hostname.includes(new URL(baseOrigin).hostname.split('.').slice(-2).join('.'))) {
          return { targetUrl: baseUrl, targetPath: '/', cleanLabel: 'Dashboard' };
        }
        return { targetUrl: u.toString(), targetPath: u.pathname, cleanLabel: trimmed };
      } catch {
        return { targetUrl: baseUrl, targetPath: '/', cleanLabel: trimmed };
      }
    }

    if (trimmed.startsWith('/')) {
      try {
        const u = new URL(trimmed, currentOrigin);
        return { targetUrl: u.toString(), targetPath: u.pathname, cleanLabel: trimmed };
      } catch {
        return { targetUrl: `${currentOrigin}${trimmed}`, targetPath: trimmed, cleanLabel: trimmed };
      }
    }

    // Target is a slug or text title (e.g. "leads", "settings", "Lead Generation")
    const cleanSlug = '/' + trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      const u = new URL(cleanSlug, currentOrigin);
      return { targetUrl: u.toString(), targetPath: u.pathname, cleanLabel: trimmed };
    } catch {
      return { targetUrl: `${currentOrigin}${cleanSlug}`, targetPath: cleanSlug, cleanLabel: trimmed };
    }
  }

  private async executeStep(
    page: Page,
    baseUrl: string,
    step: WorkflowStep,
    screenshotsDir: string,
    workflowId?: string
  ) {
    const action = step.action.toLowerCase();

    try {
      if (action === 'navigate') {
        const appOrigin = new URL(baseUrl).origin;

        // If page has drifted to an external website or policies page, return to app base first!
        if (new URL(page.url()).origin !== appOrigin || /policies|terms|privacy/i.test(page.url())) {
          console.log(`[WorkflowExecutor] Reverting off-origin navigation (${page.url()}) to ${baseUrl}`);
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        const { targetUrl, targetPath, cleanLabel } = this.safeResolveUrl(step.target, page.url(), baseUrl);

        // Extract clean human keywords from target path (e.g. '/policies' -> 'Policies', '/product-compliance' -> 'Product Compliance')
        const slugWords = targetPath
          .split('/')
          .filter(Boolean)
          .pop()
          ?.replace(/[-_]+/g, ' ')
          .trim() || '';

        const descWords = (step.description || '')
          .replace(/navigate to|explore|view|manage|section|page/gi, '')
          .trim();

        // 1. Search for visible navigation elements (navbar links, sidebar items, menus, tabs)
        let navEl = null;
        let navBox: { x: number; y: number; width: number; height: number } | null = null;

        const candidateLocators = [
          // Nav / aside links matching target route
          page.locator(`nav a[href*="${targetPath}"], aside a[href*="${targetPath}"], [class*="sidebar" i] a[href*="${targetPath}"], [class*="menu" i] a[href*="${targetPath}"]`).first(),
          // Any link matching target route
          page.locator(`a[href*="${targetPath}"], [data-href*="${targetPath}"], [data-route*="${targetPath}"]`).first(),
          // Text matches in navigation menus
          descWords ? page.locator(`nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="menu" i]`).locator(`a:has-text("${descWords}"), button:has-text("${descWords}")`).first() : null,
          slugWords ? page.locator(`nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="menu" i]`).locator(`a:has-text("${slugWords}"), button:has-text("${slugWords}")`).first() : null,
          descWords ? page.locator(`nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="menu" i]`).getByText(new RegExp(`^${descWords}$`, 'i')).first() : null,
          slugWords ? page.locator(`nav, aside, header, [role="navigation"], [class*="sidebar" i], [class*="menu" i]`).getByText(new RegExp(`^${slugWords}$`, 'i')).first() : null,
          descWords ? page.getByRole('link', { name: new RegExp(descWords, 'i') }).first() : null,
          descWords ? page.getByRole('button', { name: new RegExp(descWords, 'i') }).first() : null,
          // Tab matching
          descWords ? page.locator(`[role="tab"]:has-text("${descWords}"), .tab:has-text("${descWords}")`).first() : null,
          slugWords ? page.locator(`[role="tab"]:has-text("${slugWords}"), .tab:has-text("${slugWords}")`).first() : null,
        ].filter(Boolean);

        for (const loc of candidateLocators) {
          if (loc && (await loc.isVisible().catch(() => false))) {
            const box = await loc.boundingBox().catch(() => null);
            if (box && box.width > 12 && box.height > 10) {
              navEl = loc;
              navBox = box;
              break;
            }
          }
        }

        // If nav element wasn't immediately visible, expand collapsed sidebar / dropdown toggles
        if (!navEl) {
          try {
            const toggles = await page.$$('button[aria-expanded="false"], [class*="dropdown-toggle" i], button[class*="menu-toggle" i]');
            for (const toggle of toggles.slice(0, 2)) {
              if (await toggle.isVisible().catch(() => false)) {
                await toggle.click().catch(() => {});
                await page.waitForTimeout(350);
              }
            }
            for (const loc of candidateLocators) {
              if (loc && (await loc.isVisible().catch(() => false))) {
                const box = await loc.boundingBox().catch(() => null);
                if (box && box.width > 12 && box.height > 10) {
                  navEl = loc;
                  navBox = box;
                  break;
                }
              }
            }
          } catch {}
        }

        let eventX = 960;
        let eventY = 380;
        let eventW = 120;
        let eventH = 40;

        if (navEl && navBox) {
          eventX = Math.round(navBox.x + navBox.width / 2);
          eventY = Math.round(navBox.y + navBox.height / 2);
          eventW = Math.round(navBox.width);
          eventH = Math.round(navBox.height);

          // 1. Scroll navigation element into center of view
          await navEl.evaluate((el: HTMLElement) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }).catch(() => {});
          await page.waitForTimeout(300);

          const freshBox = await navEl.boundingBox().catch(() => navBox);
          if (freshBox) {
            eventX = Math.round(freshBox.x + freshBox.width / 2);
            eventY = Math.round(freshBox.y + freshBox.height / 2);
            eventW = Math.round(freshBox.width);
            eventH = Math.round(freshBox.height);
          }

          // 2. Smoothly move mouse cursor to the navigation element
          await page.mouse.move(eventX, eventY, { steps: 16 });
          await page.waitForTimeout(200);

          // 3. Highlight navigation element with glowing outline and background tint
          await navEl.evaluate((el: HTMLElement) => {
            el.style.outline = '3px solid #6366f1';
            el.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.9)';
            el.style.backgroundColor = 'rgba(99, 102, 241, 0.18)';
            el.style.transition = 'all 0.3s ease';
          }).catch(() => {});

          // 4. Hold mouse on highlighted area so recording captures it clearly in full view
          await page.waitForTimeout(1000);

          // 5. Click the navigation element with mouse events
          await page.mouse.down();
          await page.waitForTimeout(120);
          await page.mouse.up();

          // Remove highlight style after click
          await navEl.evaluate((el: HTMLElement) => {
            setTimeout(() => {
              el.style.outline = '';
              el.style.boxShadow = '';
              el.style.backgroundColor = '';
            }, 800);
          }).catch(() => {});

          await page.waitForLoadState('domcontentloaded').catch(() => {});
          await page.waitForTimeout(2400);

          // If navigation escaped to an external website or policy page, revert back to app base
          if (new URL(page.url()).origin !== appOrigin || /policies|terms|privacy/i.test(page.url())) {
            console.log(`[WorkflowExecutor] Navigation escaped to ${page.url()}. Reverting back to app base ${baseUrl}...`);
            await page.goBack().catch(() => page.goto(baseUrl));
            await page.waitForTimeout(2000);
          }
        }

        // Verify if page actually changed; if not, force direct navigation as fallback
        const landedPath = (() => {
          try { return new URL(page.url()).pathname; } catch { return ''; }
        })();

        if (landedPath !== targetPath && !page.url().includes(targetPath) && targetPath !== '/') {
          const targetOrigin = (() => { try { return new URL(targetUrl).origin; } catch { return ''; } })();
          if (targetOrigin === appOrigin && !/policies|terms|privacy/i.test(targetPath)) {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
            await page.waitForTimeout(2500);
          }
        }

        // Smoothly scroll back to top of new page for full presentation
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
        await page.waitForTimeout(800);

        // Move cursor to comfortable presentation spot on new page
        await page.mouse.move(960, 380, { steps: 12 });
        await page.waitForTimeout(1000);

        // Log both click and navigate events with coordinates for compositor highlight
        this.eventLogger.logEvent({
          type: 'click',
          url: page.url(),
          elementText: `Navigate to ${descWords || slugWords || cleanLabel}`,
          x: eventX,
          y: eventY,
          width: eventW,
          height: eventH,
          workflowId,
        });

        this.eventLogger.logEvent({
          type: 'navigate',
          url: page.url(),
          elementText: step.description || `Navigated to ${descWords || slugWords || cleanLabel}`,
          x: eventX,
          y: eventY,
          width: eventW,
          height: eventH,
          workflowId,
        });
        await page.waitForTimeout(2000);
      } else if (action === 'click') {
        const target = step.target || '';
        const locators = [
          page.getByRole('button', { name: target }).first(),
          page.locator(`button:has-text("${target}")`).first(),
          page.locator(`a:has-text("${target}")`).first(),
          page.locator(`text="${target}"`).first(),
          page.locator(target).first(),
        ];

        let targetEl = null;
        for (const loc of locators) {
          if (await loc.isVisible().catch(() => false)) {
            targetEl = loc;
            break;
          }
        }

        if (targetEl) {
          // Center element vertically in viewport with margin so it is in full view
          await targetEl.evaluate((el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            const targetScrollY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
            window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });
          }).catch(() => {
            targetEl.scrollIntoViewIfNeeded().catch(() => {});
          });
          await page.waitForTimeout(500);

          const box = await targetEl.boundingBox().catch(() => null);
          if (box) {
            const centerX = Math.round(box.x + box.width / 2);
            const centerY = Math.round(box.y + box.height / 2);

            // Smooth cursor movement simulation
            await page.mouse.move(centerX, centerY, { steps: 14 });
            await page.waitForTimeout(200);

            // Highlight target
            await targetEl.evaluate((el: HTMLElement) => {
              el.style.outline = '3px solid #6366f1';
              el.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
              el.style.transition = 'outline 0.3s, box-shadow 0.3s';
              setTimeout(() => {
                el.style.outline = '';
                el.style.boxShadow = '';
              }, 900);
            }).catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.up();

            this.eventLogger.logEvent({
              type: 'click',
              url: page.url(),
              elementText: target,
              x: centerX,
              y: centerY,
              width: Math.round(box.width),
              height: Math.round(box.height),
              workflowId,
            });
          }
        } else {
          // Fallback if target element not directly found
          this.eventLogger.logEvent({
            type: 'click',
            url: page.url(),
            elementText: `Simulated click on ${target}`,
            x: 960,
            y: 540,
            workflowId,
          });
        }
        await page.waitForTimeout(1800);
      } else if (action === 'input') {
        const inputLocator = page.locator('input:not([type="hidden"]):visible, textarea:visible').first();
        if (await inputLocator.isVisible().catch(() => false)) {
          // Center input vertically in viewport so it's in full view
          await inputLocator.evaluate((el: HTMLElement) => {
            const rect = el.getBoundingClientRect();
            const targetScrollY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
            window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });
          }).catch(() => {
            inputLocator.scrollIntoViewIfNeeded().catch(() => {});
          });
          await page.waitForTimeout(500);

          const box = await inputLocator.boundingBox().catch(() => null);
          if (box) {
            const cx = Math.round(box.x + box.width / 2);
            const cy = Math.round(box.y + box.height / 2);
            await page.mouse.move(cx, cy, { steps: 12 });
            await page.waitForTimeout(150);

            await inputLocator.evaluate((el: HTMLElement) => {
              el.style.outline = '3px solid #6366f1';
              el.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
              setTimeout(() => {
                el.style.outline = '';
                el.style.boxShadow = '';
              }, 900);
            }).catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(60);
            await page.mouse.up();
          }

          const val = step.value || 'Demonstration sample entry';
          await inputLocator.fill(val).catch(() => {});

          this.eventLogger.logEvent({
            type: 'input',
            url: page.url(),
            elementText: step.description || 'Filled form parameters',
            inputValue: val,
            x: box ? Math.round(box.x + box.width / 2) : undefined,
            y: box ? Math.round(box.y + box.height / 2) : undefined,
            width: box ? Math.round(box.width) : undefined,
            height: box ? Math.round(box.height) : undefined,
            workflowId,
          });
        }
        await page.waitForTimeout(1600);
      } else if (action === 'scroll') {
        const scrollTarget = step.target;
        let centeredTarget = false;

        if (scrollTarget) {
          const targetLoc = page.locator(scrollTarget).or(page.locator(`text="${scrollTarget}"`)).first();
          if (await targetLoc.isVisible().catch(() => false)) {
            // Scroll target into exact vertical center of the viewport
            await targetLoc.evaluate((el: HTMLElement) => {
              const rect = el.getBoundingClientRect();
              const targetScrollY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
              window.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'smooth' });
            }).catch(() => {});
            await page.waitForTimeout(1000);

            // Move mouse smoothly over the centered target and pause to showcase in full view
            const box = await targetLoc.boundingBox().catch(() => null);
            if (box) {
              const cx = Math.round(box.x + box.width / 2);
              const cy = Math.round(box.y + box.height / 2);
              await page.mouse.move(cx, cy, { steps: 12 });
              await page.waitForTimeout(1800);
            }
            centeredTarget = true;
          }
        }

        if (!centeredTarget) {
          // Cinematic smooth scroll down to reveal page contents
          await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' })).catch(() => {});
          await page.waitForTimeout(1500);

          // Move mouse gently across the revealed section
          await page.mouse.move(820, 520, { steps: 12 });
          await page.waitForTimeout(1200);

          // Gently glide back so viewport stays centered and balanced, NEVER stuck at the bottom
          await page.evaluate(() => window.scrollBy({ top: -200, behavior: 'smooth' })).catch(() => {});
          await page.waitForTimeout(900);
        }

        this.eventLogger.logEvent({
          type: 'scroll',
          url: page.url(),
          elementText: step.description || 'Scrolled page content into full view',
          workflowId,
        });
        await page.waitForTimeout(1400);
      } else if (action === 'explain') {
        // Smoothly glide mouse across the presentation area
        await page.mouse.move(960, 480, { steps: 14 }).catch(() => {});

        this.eventLogger.logEvent({
          type: 'hover',
          url: page.url(),
          elementText: step.description,
          workflowId,
        });
        await page.waitForTimeout(2500);
      }
    } catch {
      // Step resilience: continue workflow execution even if one action times out
    }
  }
}
