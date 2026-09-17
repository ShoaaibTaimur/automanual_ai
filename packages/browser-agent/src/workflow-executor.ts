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
      storageStatePath: options.storageStatePath,
      slowMo: 150,
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

    try {
      // Initial landing navigation
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(4000); // wait for SPA hydration

      // Position mouse initially at center
      await page.mouse.move(960, 540, { steps: 5 });

      // Verify we're NOT stuck on a login page after session restore
      const landingUrl = page.url();
      const onLoginPage = /login|signin|auth/i.test(new URL(landingUrl).pathname);
      if (onLoginPage) {
        console.warn(`[WorkflowExecutor] WARNING: Session load landed on login page (${landingUrl}). Workflows will run from login context.`);
      } else {
        console.log(`[WorkflowExecutor] Authenticated landing: ${landingUrl}`);
      }

      this.eventLogger.logEvent({
        type: 'navigate',
        url: page.url(),
        elementText: 'Application loaded',
      });

      const maxWorkflows = options.maxWorkflows || plan.workflows.length;
      const workflowsToRun = plan.workflows.slice(0, maxWorkflows);

      for (const workflow of workflowsToRun) {
        console.log(`Executing workflow: [Priority ${workflow.priority}] ${workflow.title}`);

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

          await this.executeStep(page, baseUrl, step, screenshotsDir, workflow.id);
        }
      }

      // Concluding hold to let final video frames settle
      await page.waitForTimeout(1500);

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
        const effectiveOrigin = (() => {
          try {
            const cur = page.url();
            return (cur && cur !== 'about:blank') ? new URL(cur).origin : new URL(baseUrl).origin;
          } catch {
            return baseUrl;
          }
        })();

        const targetUrl = step.target?.startsWith('http')
          ? step.target
          : new URL(step.target || '/', effectiveOrigin).toString();

        if (page.url() !== targetUrl) {
          let clickedLink = false;
          try {
            const targetPath = new URL(targetUrl).pathname;
            // Search for visible navigation links matching target
            const linkLocators = [
              page.locator(`nav a[href*="${targetPath}"], aside a[href*="${targetPath}"]`).first(),
              page.locator(`a[href*="${targetPath}"]`).first(),
              step.description ? page.locator(`a:has-text("${step.description}"), button:has-text("${step.description}")`).first() : null,
              step.target ? page.locator(`a:has-text("${step.target}"), button:has-text("${step.target}")`).first() : null,
            ].filter(Boolean);

            for (const loc of linkLocators) {
              if (loc && await loc.isVisible().catch(() => false)) {
                const box = await loc.boundingBox().catch(() => null);
                if (box) {
                  const cx = Math.round(box.x + box.width / 2);
                  const cy = Math.round(box.y + box.height / 2);
                  await page.mouse.move(cx, cy, { steps: 14 });
                  await page.waitForTimeout(200);

                  await loc.evaluate((el: HTMLElement) => {
                    el.style.outline = '3px solid #6366f1';
                    el.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
                    setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 900);
                  }).catch(() => {});

                  await page.mouse.down();
                  await page.waitForTimeout(80);
                  await page.mouse.up();
                  clickedLink = true;
                  await page.waitForTimeout(2500);
                  break;
                }
              }
            }
          } catch {
            // Link search failed, fallback to direct navigation
          }

          if (!clickedLink && page.url() !== targetUrl) {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
            await page.waitForTimeout(2000);
          }
        }

        this.eventLogger.logEvent({
          type: 'navigate',
          url: page.url(),
          elementText: step.description || `Navigated to ${step.target}`,
          workflowId,
        });
        await page.waitForTimeout(2000);
      } else if (action === 'click') {
        const target = step.target || '';
        // Try locating element by text, role, or selector
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
              setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 900);
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
        // Look for first visible interactive input
        const inputLocator = page.locator('input:not([type="hidden"]):visible, textarea:visible').first();
        if (await inputLocator.isVisible().catch(() => false)) {
          const box = await inputLocator.boundingBox().catch(() => null);
          if (box) {
            const cx = Math.round(box.x + box.width / 2);
            const cy = Math.round(box.y + box.height / 2);
            await page.mouse.move(cx, cy, { steps: 12 });
            await page.waitForTimeout(150);

            await inputLocator.evaluate((el: HTMLElement) => {
              el.style.outline = '3px solid #6366f1';
              el.style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
              setTimeout(() => { el.style.outline = ''; el.style.boxShadow = ''; }, 900);
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
        await page.waitForTimeout(1500);
      } else if (action === 'scroll') {
        await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' })).catch(() => {});
        this.eventLogger.logEvent({
          type: 'scroll',
          url: page.url(),
          elementText: 'Scrolled page content',
          workflowId,
        });
        await page.waitForTimeout(1500);
      } else if (action === 'explain') {
        this.eventLogger.logEvent({
          type: 'hover',
          url: page.url(),
          elementText: step.description,
          workflowId,
        });
        await page.waitForTimeout(2000);
      }
    } catch {
      // Step resilience: continue workflow execution even if one action times out
    }
  }
}
