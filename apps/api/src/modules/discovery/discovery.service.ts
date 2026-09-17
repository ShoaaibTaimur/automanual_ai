import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserRunner, DiscoveryEngine } from '@automanual/browser-agent';
import { FeatureSynthesizer } from '@automanual/ai-engine';
import { ProjectStatus, DiscoveryData } from '@automanual/shared';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private discoveryEngine = new DiscoveryEngine();
  private featureSynthesizer = new FeatureSynthesizer();

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

      this.logger.log(`Discovered ${rawSections.length} sections for ${project.name}. Synthesizing feature map...`);

      // Synthesize high-level feature map
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
