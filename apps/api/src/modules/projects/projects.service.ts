import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { PlansService } from '../plans/plans.service';
import { CreateProjectDto, ProjectStatus } from '@automanual/shared';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly plansService: PlansService,
  ) {}

  async create(dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        baseUrl: dto.baseUrl,
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
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    this.logger.log(`Received retry request for project ${id} (status: ${project.status})`);

    // Clear previous error message
    await this.prisma.project.update({
      where: { id },
      data: { errorMessage: null },
    });

    // If discovery or plan is incomplete, retry discovery
    if (!project.discovery || !project.plan || project.plan.workflows.length === 0) {
      await this.prisma.project.update({
        where: { id },
        data: { status: ProjectStatus.CREATED },
      });

      setImmediate(async () => {
        try {
          this.logger.log(`Retrying discovery for project ${id}...`);
          await this.discoveryService.discoverProject(id);
          this.logger.log(`Retrying plan generation for project ${id}...`);
          await this.plansService.generatePlanForProject(id);
        } catch (err: any) {
          this.logger.error(`Retry discovery failed for ${id}: ${err.message}`);
        }
      });

      return { message: 'Discovery restarted', status: ProjectStatus.CREATED };
    } else {
      // Plan exists, retry pipeline execution
      await this.prisma.project.update({
        where: { id },
        data: { status: ProjectStatus.AWAITING_APPROVAL },
      });

      await this.plansService.approvePlan(id);
      return { message: 'Pipeline execution restarted', status: ProjectStatus.EXECUTING };
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.delete({
      where: { id },
    });
  }
}
