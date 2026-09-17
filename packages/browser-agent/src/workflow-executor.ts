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
      slowMo: 100,
    });

    try {
      // Initial landing navigation
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      this.eventLogger.logEvent({
        type: 'navigate',
        url: page.url(),
        elementText: 'Initial page load',
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
        const targetUrl = step.target?.startsWith('http')
          ? step.target
          : new URL(step.target || '/', baseUrl).toString();

        if (page.url() !== targetUrl) {
          await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
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
            await page.mouse.move(centerX, centerY, { steps: 10 });
            await page.waitForTimeout(200);

            // Highlight target
            await targetEl.evaluate((el: HTMLElement) => {
              el.style.outline = '2px solid #6366f1';
              el.style.transition = 'outline 0.3s';
              setTimeout(() => { el.style.outline = ''; }, 800);
            }).catch(() => {});

            await page.mouse.down();
            await page.waitForTimeout(80);
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
