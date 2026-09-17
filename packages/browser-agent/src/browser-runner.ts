import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserSessionOptions } from '@automanual/shared';
import * as fs from 'fs';
import * as path from 'path';

export class BrowserRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(options: BrowserSessionOptions = {}): Promise<Page> {
    const headless = options.headless !== undefined 
      ? options.headless 
      : process.env.PLAYWRIGHT_HEADLESS === 'true';

    this.browser = await chromium.launch({
      headless,
      slowMo: options.slowMo || 50,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: options.viewport || { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    };

    if (options.storageStatePath && fs.existsSync(options.storageStatePath)) {
      contextOptions.storageState = options.storageStatePath;
    }

    if (options.recordVideoDir) {
      fs.mkdirSync(options.recordVideoDir, { recursive: true });
      contextOptions.recordVideo = {
        dir: options.recordVideoDir,
        size: options.viewport || { width: 1920, height: 1080 },
      };
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    this.page.setDefaultTimeout(30000);
    this.page.setDefaultNavigationTimeout(30000);

    return this.page;
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser not initialized. Call launch() first.');
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('Browser context not initialized. Call launch() first.');
    return this.context;
  }

  async saveStorageState(savePath: string): Promise<string> {
    if (!this.context) throw new Error('Browser context not initialized.');
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    await this.context.storageState({ path: savePath });
    return savePath;
  }

  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
