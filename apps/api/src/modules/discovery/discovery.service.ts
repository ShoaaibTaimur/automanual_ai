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

    // Set status to DISCOVERING
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.DISCOVERING },
    });

    const storageBase = process.env.STORAGE_PATH || './storage';
    const projectStorageDir = path.resolve(storageBase, 'projects', projectId);
    const sessionPath = path.join(projectStorageDir, 'session.json');
    const screenshotsDir = path.join(projectStorageDir, 'discovery');

    fs.mkdirSync(screenshotsDir, { recursive: true });

    const runner = new BrowserRunner();

    try {
      this.logger.log(`Starting autonomous discovery for project ${project.name} (${project.baseUrl})`);

      // 1. If project requires authentication, execute login first and store session
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
            this.logger.warn('Failed to decrypt credentials with AES, using raw string');
          }
        }

        this.logger.log(`Performing autonomous login for user "${username}" at ${project.baseUrl}...`);
        const authPage = await runner.launch({
          viewport: { width: 1920, height: 1080 },
        });

        await authPage.goto(project.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const loginResult = await this.loginManager.login(runner, authPage, {
          username,
          password,
          storageStatePath: sessionPath,
        });

        if (!loginResult.success) {
          this.logger.warn(`Login attempt result: ${loginResult.error || 'Form still visible'}`);
        } else {
          this.logger.log(`Login successful! Authenticated session saved to ${sessionPath}`);
        }

        await runner.close();
      }

      // 2. Launch browser with authenticated storageState (if available) to crawl the application
      const page = await runner.launch({
        viewport: { width: 1920, height: 1080 },
        storageStatePath: fs.existsSync(sessionPath) ? sessionPath : undefined,
      });

      // Crawl sections and interactive elements
      const rawSections = await this.discoveryEngine.crawlApplication(
        runner,
        page,
        project.baseUrl,
        { screenshotsDir, maxRoutes: 6 }
      );

      this.logger.log(`Discovered ${rawSections.length} sections for ${project.name}. Synthesizing feature map with AI...`);

      // Synthesize high-level feature map using Resilient AI
      const discoveryData = await this.featureSynthesizer.synthesize(
        project.name,
        project.baseUrl,
        rawSections,
        project.authRequired
      );

      // Collect screenshot paths
      const screenshotPaths = rawSections
        .map(s => s.screenshotPath)
        .filter((p): p is string => Boolean(p));

      // Save to database
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

      // Update project status to PLAN_READY
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.PLAN_READY },
      });

      await runner.close();
      this.logger.log(`Discovery complete for project ${project.name}. Status updated to PLAN_READY.`);

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
