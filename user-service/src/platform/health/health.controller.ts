/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of health controller code (HealthController).
 * Author review: Validated HealthController Get handlers, parameter handling, and returned values; edited handler naming and formatting (user-service/src/platform/health/health.controller.ts).
 */

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PrismaService } from '../database/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the User Service process is alive' })
  @ApiOkResponse({ description: 'The process is alive.' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check whether the User Service database is ready' })
  @ApiOkResponse({ description: 'The service and database are ready.' })
  @ApiServiceUnavailableResponse({
    description: 'The database is unavailable.',
  })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }
  }
}
