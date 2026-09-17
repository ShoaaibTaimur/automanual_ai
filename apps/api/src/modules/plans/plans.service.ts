import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { PlanGenerator } from '@automanual/ai-engine';
import { ProjectStatus, DiscoveryData } from '@automanual/shared';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);
  private planGenerator = new PlanGenerator();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService
  ) {}

  async generatePlanForProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { discovery: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    if (!project.discovery) {
      throw new BadRequestException(`Project ${projectId} has not been discovered yet. Run discovery first.`);
    }

    const discoveryData: DiscoveryData = {
      applicationName: project.name,
      baseUrl: project.baseUrl,
      sections: project.discovery.sections as any,
      authRequired: project.authRequired,
      discoveredAt: project.discovery.createdAt.toISOString(),
    };

    this.logger.log(`Generating autonomous user-manual plan for ${project.name}...`);
    const planResult = await this.planGenerator.generatePlan(discoveryData);

    const existingPlan = await this.prisma.plan.findUnique({
      where: { projectId },
    });

    if (existingPlan) {
      await this.prisma.workflow.deleteMany({
        where: { planId: existingPlan.id },
      });
    }

    const plan = await this.prisma.plan.upsert({
      where: { projectId },
      create: {
        projectId,
        title: planResult.title,
        estimatedDuration: planResult.estimatedDuration,
        rawJson: planResult as any,
        approved: false,
      },
      update: {
        title: planResult.title,
        estimatedDuration: planResult.estimatedDuration,
        rawJson: planResult as any,
        approved: false,
        approvedAt: null,
      },
    });

    for (const w of planResult.workflows) {
      await this.prisma.workflow.create({
        data: {
          planId: plan.id,
          workflowId: w.id,
          title: w.title,
          priority: w.priority,
          stepsJson: w.steps as any,
        },
      });
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.AWAITING_APPROVAL },
    });

    this.logger.log(`Plan generated with ${planResult.workflows.length} workflows. Project status: AWAITING_APPROVAL.`);

    return this.getPlan(projectId);
  }

  async getPlan(projectId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { projectId },
      include: {
        workflows: {
          orderBy: { priority: 'asc' },
        },
        project: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan for project ${projectId} not found`);
    }

    return plan;
  }

  async approvePlan(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { plan: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    if (!project.plan) {
      throw new BadRequestException(`No plan exists for project ${projectId}. Generate plan first.`);
    }

    if (project.plan.approved) {
      return {
        message: 'Plan was already approved',
        project,
        plan: project.plan,
      };
    }

    // Mark plan as approved
    const updatedPlan = await this.prisma.plan.update({
      where: { projectId },
      data: {
        approved: true,
        approvedAt: new Date(),
      },
    });

    // Transition project status to EXECUTING
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.EXECUTING,
      },
    });

    // Enqueue automated pipeline
    const jobResult = await this.jobsService.startGenerationPipeline(projectId);

    this.logger.log(`Plan approved for project ${projectId}. Pipeline started.`);

    return {
      message: 'Plan approved successfully. Generation pipeline started.',
      project: updatedProject,
      plan: updatedPlan,
      job: jobResult,
    };
  }
}
