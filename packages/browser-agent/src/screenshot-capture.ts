import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface ScreenshotOptions {
  outputDir: string;
  filenamePrefix?: string;
  fullPage?: boolean;
}

export class ScreenshotCapture {
  async capture(page: Page, options: ScreenshotOptions): Promise<string> {
    fs.mkdirSync(options.outputDir, { recursive: true });
    const timestamp = Date.now();
    const prefix = options.filenamePrefix || 'screenshot';
    const filePath = path.join(options.outputDir, `${prefix}-${timestamp}.png`);

    await page.screenshot({
      path: filePath,
      fullPage: options.fullPage ?? false,
    });

    return filePath;
  }
}
