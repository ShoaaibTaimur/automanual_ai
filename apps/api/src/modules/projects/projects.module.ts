import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [DiscoveryModule, PlansModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
