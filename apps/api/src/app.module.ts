import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { BrowserModule } from './modules/browser/browser.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { PlansModule } from './modules/plans/plans.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { GenerationModule } from './modules/generation/generation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    HealthModule,
    ProjectsModule,
    BrowserModule,
    DiscoveryModule,
    PlansModule,
    JobsModule,
    GenerationModule,
  ],
})
export class AppModule {}
