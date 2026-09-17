import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserRunner, DiscoveryEngine, LoginManager } from '@automanual/browser-agent';
import { FeatureSynthesizer } from '@automanual/ai-engine';
import { ProjectStatus, DiscoveryData, decryptCredentials } from '@automanual/shared';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private discoveryEngine = new DiscoveryEngine();
  private featureSynthesizer = new FeatureSynthesizer();
  private loginManager = new LoginManager();

  constructor(private readonly prisma: PrismaService) {}

  async discoverProject(projectId: string): Promise<DiscoveryData> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.DISCOVERING },
    });

    const storageBase = process.env.STORAGE_PATH || './storage';
    const projectStorageDir = path.resolve(storageBase, 'projects', projectId);
    const sessionPath = path.join(projectStorageDir, 'session.json');
    const screenshotsDir = path.join(projectStorageDir, 'discovery');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    this.logger.log(`Starting autonomous discovery for project ${project.name} (${project.baseUrl})`);

    // ONE browser handles login + crawl — no close between phases
    const runner = new BrowserRunner();

    try {
      const page = await runner.launch({
        viewport: { width: 1920, height: 1080 },
        slowMo: 80,
      });

      // ── Phase 1: Login (if required) ──────────────────────────────────────
      if (project.authRequired && project.credentialsEncrypted) {
        let username = '';
        let password = '';
        const secretKey = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        if (project.credentialsEncrypted.startsWith('enc:')) {
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
            this.logger.warn('Failed to decrypt credentials, using raw string');
          }
        }

        this.logger.log(`Navigating to ${project.baseUrl} for login as "${username}"...`);
        await page.goto(project.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        const loginResult = await this.loginManager.login(runner, page, {
          username,
          password,
          storageStatePath: sessionPath,
        });

        if (loginResult.success) {
          const postLoginUrl = page.url();
          this.logger.log(`Login successful! Session saved. Now on: ${postLoginUrl}`);
          // Give SPA time to fully hydrate dashboard before crawl starts
          await page.waitForTimeout(3500);

          // If domain or subdomain changed after login (e.g. www -> dashboard),
          // update project.baseUrl so workflow execution runs on dashboard directly!
          if (postLoginUrl && postLoginUrl !== 'about:blank' && postLoginUrl !== project.baseUrl) {
            this.logger.log(`Updating project baseUrl to authenticated URL: ${postLoginUrl}`);
            await this.prisma.project.update({
              where: { id: projectId },
              data: { baseUrl: postLoginUrl },
            }).catch(() => {});
            project.baseUrl = postLoginUrl;
          }
        } else {
          this.logger.warn(`Login failed: ${loginResult.error}. Crawl will proceed from current page.`);
        }
      } else {
        // No auth — just navigate to base URL
        await page.goto(project.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
      }

      // ── Phase 2: Crawl (same browser, already authenticated) ──────────────
      const currentUrl = page.url();
      this.logger.log(`Starting crawl from: ${currentUrl}`);

      const rawSections = await this.discoveryEngine.crawlApplication(
        runner,
        page,
        currentUrl, // Use currentUrl so all links on the dashboard are explored!
        { screenshotsDir, maxRoutes: 8 },
      );

      await runner.close();
      this.logger.log(`Discovered ${rawSections.length} sections for ${project.name}. Synthesizing with AI...`);

      // ── Phase 3: AI synthesis ─────────────────────────────────────────────
      const discoveryData = await this.featureSynthesizer.synthesize(
        project.name,
        currentUrl,
        rawSections,
        project.authRequired,
      );

      const screenshotPaths = rawSections
        .map(s => s.screenshotPath)
        .filter((p): p is string => Boolean(p));

      await this.prisma.discovery.upsert({
        where: { projectId },
        create: {
          projectId,
          rawJson: rawSections as any,
          sections: discoveryData.sections as any,
          screenshotPaths,
        },
        update: {
          rawJson: rawSections as any,
          sections: discoveryData.sections as any,
          screenshotPaths,
        },
      });

      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.PLAN_READY },
      });

      this.logger.log(`Discovery complete for project ${project.name}.`);
      return discoveryData;
    } catch (err: any) {
      await runner.close();
      this.logger.error(`Discovery failed for project ${projectId}: ${err.message}`);

      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.FAILED,
          errorMessage: `Discovery error: ${err.message}`,
        },
      });

      throw err;
    }
  }

  async getDiscovery(projectId: string) {
    const discovery = await this.prisma.discovery.findUnique({
      where: { projectId },
      include: { project: true },
    });

    if (!discovery) {
      throw new NotFoundException(`Discovery data for project ${projectId} not found`);
    }

    return discovery;
  }
}
