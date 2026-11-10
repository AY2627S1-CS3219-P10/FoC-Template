/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of health controller code (HealthController).
 * Author review: Validated HealthController Get handlers, parameter handling, and returned values; edited handler naming and formatting (order-service/src/api/health.controller.ts).
 */

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('PostgreSQL is unavailable');
    }
  }
}
