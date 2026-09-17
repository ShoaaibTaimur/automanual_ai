import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserRunner, AuthDetector, LoginManager, ScreenshotCapture } from '@automanual/browser-agent';
import { decryptCredentials, ProjectStatus } from '@automanual/shared';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);
  private authDetector = new AuthDetector();
  private loginManager = new LoginManager();
  private screenshotCapture = new ScreenshotCapture();

  constructor(private readonly prisma: PrismaService) {}

  async testProjectAuth(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const runner = new BrowserRunner();
    const storageBase = process.env.STORAGE_PATH || './storage';
    const projectStorageDir = path.resolve(storageBase, 'projects', projectId);
    const sessionPath = path.join(projectStorageDir, 'session.json');
    const screenshotsDir = path.join(projectStorageDir, 'screenshots');
    const videoDir = path.join(projectStorageDir, 'recordings');

    fs.mkdirSync(screenshotsDir, { recursive: true });

    try {
      this.logger.log(`Launching browser for project: ${project.name} (${project.baseUrl})`);
      const page = await runner.launch({
        viewport: { width: 1920, height: 1080 },
        recordVideoDir: videoDir,
      });

      this.logger.log(`Navigating to ${project.baseUrl}...`);
      await page.goto(project.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Detect auth form
      const detection = await this.authDetector.detect(page);
      this.logger.log(`Auth detection: isAuthPage=${detection.isAuthPage}, title="${detection.pageTitle}"`);

      // Initial screenshot
      const initialScreenshot = await this.screenshotCapture.capture(page, {
        outputDir: screenshotsDir,
        filenamePrefix: 'initial',
      });

      let loginResult = null;

      if (project.authRequired && project.credentialsEncrypted) {
        let username = '';
        let password = '';

        const secretKey = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (project.credentialsEncrypted.startsWith('enc:')) {
          // Plain format demo fallback or encrypted format
          const parts = project.credentialsEncrypted.replace('enc:', '').split(':');
          username = parts[0] || '';
          password = parts[1] || '';
        } else {
          try {
            const decrypted = decryptCredentials(project.credentialsEncrypted, secretKey);
            const parsed = JSON.parse(decrypted);
            username = parsed.username || '';
            password = parsed.password || '';
          } catch {
            this.logger.warn('Failed to decrypt credentials with AES, using raw value');
          }
        }

        this.logger.log(`Executing autonomous login for ${username}...`);
        loginResult = await this.loginManager.login(runner, page, {
          username,
          password,
          storageStatePath: sessionPath,
        });

        this.logger.log(`Login result: success=${loginResult.success}, url=${loginResult.redirectUrl}`);
      }

      // Post-login screenshot
      const postAuthScreenshot = await this.screenshotCapture.capture(page, {
        outputDir: screenshotsDir,
        filenamePrefix: 'post-auth',
      });

      await runner.close();

      return {
        projectId,
        baseUrl: project.baseUrl,
        detection,
        loginResult,
        screenshots: {
          initial: initialScreenshot,
          postAuth: postAuthScreenshot,
        },
        sessionSaved: fs.existsSync(sessionPath),
      };
    } catch (error: any) {
      await runner.close();
      this.logger.error(`Browser execution failed: ${error.message}`);
      throw error;
    }
  }
}
