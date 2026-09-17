import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, ProjectStatus } from '@automanual/shared';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        baseUrl: dto.baseUrl,
        authRequired: dto.authRequired,
        credentialsEncrypted: dto.password ? `enc:${dto.username}:${dto.password}` : null,
        status: ProjectStatus.CREATED,
      },
    });
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
