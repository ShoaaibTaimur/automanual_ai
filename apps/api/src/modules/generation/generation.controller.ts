import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus } from '@automanual/shared';

@Controller('projects')
export class GenerationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        plan: true,
        recordings: true,
        narrations: true,
        videoRenders: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    // Calculate progress percentage based on status enum
    let progress = 0;
    switch (project.status) {
      case ProjectStatus.CREATED:
        progress = 5;
        break;
      case ProjectStatus.DISCOVERING:
        progress = 20;
        break;
      case ProjectStatus.PLAN_READY:
        progress = 30;
        break;
      case ProjectStatus.AWAITING_APPROVAL:
        progress = 40;
        break;
      case ProjectStatus.EXECUTING:
        progress = 50;
        break;
      case ProjectStatus.RECORDING:
        progress = 65;
        break;
      case ProjectStatus.GENERATING_NARRATION:
        progress = 75;
        break;
      case ProjectStatus.GENERATING_VOICE:
        progress = 85;
        break;
      case ProjectStatus.RENDERING_VIDEO: {
        const renderProgress = project.videoRenders?.[0]?.progress ?? 0;
        progress = Math.min(99, 85 + Math.floor((renderProgress / 100) * 14));
        break;
      }
      case ProjectStatus.COMPLETED:
        progress = 100;
        break;
      case ProjectStatus.FAILED:
        progress = 0;
        break;
    }

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      progress,
      isApproved: project.plan?.approved ?? false,
      approvedAt: project.plan?.approvedAt,
      errorMessage: project.errorMessage,
      updatedAt: project.updatedAt,
    };
  }
}
