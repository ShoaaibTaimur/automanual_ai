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

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.project.delete({
      where: { id },
    });
  }
}
