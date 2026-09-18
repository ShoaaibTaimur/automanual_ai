import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { PlansService } from '../plans/plans.service';
import { JobsService } from '../jobs/jobs.service';
import { CreateProjectDto, ProjectStatus } from '@automanual/shared';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly plansService: PlansService,
    private readonly jobsService: JobsService,
  ) {}

  async create(dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        baseUrl: dto.baseUrl,
        loginUrl: dto.authRequired ? dto.baseUrl : null,
        authRequired: dto.authRequired,
        credentialsEncrypted: dto.password ? `enc:${dto.username}:${dto.password}` : null,
        status: ProjectStatus.CREATED,
      },
    });

    // Asynchronously trigger autonomous discovery and plan generation
    setImmediate(async () => {
      try {
        this.logger.log(`Auto-triggering discovery for project ${project.id} (${project.baseUrl})...`);
        await this.discoveryService.discoverProject(project.id);
        this.logger.log(`Auto-triggering plan generation for project ${project.id}...`);
        await this.plansService.generatePlanForProject(project.id);
      } catch (err: any) {
        this.logger.error(`Automatic discovery/planning failed for ${project.id}: ${err.message}`);
      }
    });

    return project;
  }

  async findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        discovery: true,
        plan: true,
        videoRenders: true,
      },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        discovery: true,
        plan: {
          include: {
            workflows: true,
          },
        },
        recordings: true,
        narrations: true,
        videoRenders: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async retry(id: string) {
    const project = await this.findOne(id);

    this.logger.log(`Full reset retry for project ${id} (current status: ${project.status})`);

    // 1. Wipe all child DB records so pipeline runs clean
    await this.prisma.narrationSegment.deleteMany({ where: { projectId: id } });
    await this.prisma.recording.deleteMany({ where: { projectId: id } });
    await this.prisma.videoRender.deleteMany({ where: { projectId: id } });

    // Delete plan workflows then the plan itself
    if (project.plan) {
      await this.prisma.workflow.deleteMany({ where: { planId: project.plan.id } });
      await this.prisma.plan.delete({ where: { id: project.plan.id } }).catch(() => {});
    }

    // Delete discovery record
    if (project.discovery) {
      await this.prisma.discovery.delete({ where: { id: project.discovery.id } }).catch(() => {});
    }

    // 2. Wipe storage directory (recordings, renders, audio, screenshots, etc.)
    const storageBase = process.env.STORAGE_PATH || './storage';
    const projectStorageDir = path.resolve(storageBase, 'projects', id);
    if (fs.existsSync(projectStorageDir)) {
      fs.rmSync(projectStorageDir, { recursive: true, force: true });
      this.logger.log(`Cleared storage dir: ${projectStorageDir}`);
    }

    // 3. Reset project status, clear error, and restore original login baseUrl
    const originalBaseUrl = project.loginUrl || project.baseUrl;
    await this.prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.CREATED,
        errorMessage: null,
        baseUrl: originalBaseUrl,
        authenticatedUrl: null,
      },
    });

    // 4. Re-run full pipeline from scratch
    setImmediate(async () => {
      try {
        this.logger.log(`Re-running discovery for project ${id}...`);
        await this.discoveryService.discoverProject(id);
        this.logger.log(`Re-running plan generation for project ${id}...`);
        await this.plansService.generatePlanForProject(id);
      } catch (err: any) {
        this.logger.error(`Retry pipeline failed for ${id}: ${err.message}`);
      }
    });

    return { message: 'Project fully reset and pipeline restarted from scratch', status: ProjectStatus.CREATED };
  }

  async remove(id: string) {
    const project = await this.findOne(id);

    // 1. Cancel any running job / pipeline
    await this.jobsService.cancelProject(id).catch(() => {});

    // 2. Wipe storage directory (recordings, renders, audio, discovery, etc.)
    const storageBase = process.env.STORAGE_PATH || './storage';
    const projectStorageDir = path.resolve(storageBase, 'projects', id);
    if (fs.existsSync(projectStorageDir)) {
      try {
        fs.rmSync(projectStorageDir, { recursive: true, force: true });
        this.logger.log(`Wiped project storage directory: ${projectStorageDir}`);
      } catch (err: any) {
        this.logger.warn(`Failed to wipe storage dir for ${id}: ${err.message}`);
      }
    }

    // 3. Delete from database (cascades to all related records)
    await this.prisma.project.delete({
      where: { id },
    });

    this.logger.log(`Deleted project ${id} (${project.name}) and all associated data.`);
    return { success: true, message: 'Project and all associated data deleted successfully', id };
  }
}
