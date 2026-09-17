import { Controller, Post, Param } from '@nestjs/common';
import { BrowserService } from './browser.service';

@Controller('projects')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Post(':id/auth-test')
  testAuth(@Param('id') id: string) {
    return this.browserService.testProjectAuth(id);
  }
}
