import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CreditMetricsService } from '../infrastructure/credit-metrics.service';
import { InternalCallerOnly } from './internal-caller.decorator';
import { InternalServiceAuthGuard } from './internal-service-auth.guard';

@ApiTags('operations')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: CreditMetricsService) {}

  @Get()
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('monitoring')
  @ApiBearerAuth('internal-service-token')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiProduces('text/plain')
  @ApiOperation({ summary: 'Prometheus credit operation metrics' })
  getMetrics(): string {
    return this.metrics.render();
  }
}
