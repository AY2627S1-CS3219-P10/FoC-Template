import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { CreditService } from '../application/credit.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly creditService: CreditService) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process is alive' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Database is reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database is unavailable' })
  async ready() {
    if (!(await this.creditService.isReady())) {
      throw new ServiceUnavailableException('Database is unavailable');
    }
    return { status: 'ok' };
  }
}
