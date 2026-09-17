import { Controller, Post, Get, Param } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';

@Controller('projects')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Post(':id/discover')
  discover(@Param('id') id: string) {
    return this.discoveryService.discoverProject(id);
  }

  @Get(':id/discovery')
  getDiscovery(@Param('id') id: string) {
    return this.discoveryService.getDiscovery(id);
  }
}
