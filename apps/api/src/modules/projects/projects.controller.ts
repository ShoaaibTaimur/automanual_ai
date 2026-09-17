import { Controller, Get, Post, Delete, Param, Body, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JobsService } from '../jobs/jobs.service';
import { CreateProjectDto } from '@automanual/shared';
import * as fs from 'fs';
import * as path from 'path';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly jobsService: JobsService,
  ) {}

  @Post()
  create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.projectsService.retry(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.jobsService.cancelProject(id);
  }

  @Get(':id/timings')
  async getTimings(@Param('id') id: string) {
    const storageBase = process.env.STORAGE_PATH || './storage';
    const timingsPath = path.resolve(storageBase, 'projects', id, 'timings.json');
    if (!fs.existsSync(timingsPath)) {
      throw new NotFoundException('Timings not yet available for this project');
    }
    const raw = fs.readFileSync(timingsPath, 'utf8');
    return JSON.parse(raw);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
