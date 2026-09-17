import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to database.');
    } catch (error) {
      this.logger.warn(`Prisma initial connection failed: ${error.message}. Will retry when needed.`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
