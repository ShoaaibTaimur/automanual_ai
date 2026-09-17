import { Controller, Post, Get, Param } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('projects')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post(':id/plan/generate')
  generatePlan(@Param('id') id: string) {
    return this.plansService.generatePlanForProject(id);
  }

  @Get(':id/plan')
  getPlan(@Param('id') id: string) {
    return this.plansService.getPlan(id);
  }

  @Post(':id/plan/approve')
  approvePlan(@Param('id') id: string) {
    return this.plansService.approvePlan(id);
  }
}
