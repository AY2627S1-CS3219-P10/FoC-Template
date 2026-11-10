/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of infrastructure module code (InfrastructureModule).
 * Author review: Checked InfrastructureModule imports, provider registrations, and exports against the existing references; organized module declaration formatting.
 */

import { Module } from '@nestjs/common';
import { CREDIT_REPOSITORY } from '../application/credit.repository';
import { CreditMetricsService } from './credit-metrics.service';
import { PrismaCreditRepository } from './prisma-credit.repository';
import { PrismaService } from './prisma.service';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  providers: [
    PrismaService,
    PrismaCreditRepository,
    CreditMetricsService,
    OutboxRelayService,
    {
      provide: CREDIT_REPOSITORY,
      useExisting: PrismaCreditRepository,
    },
  ],
  exports: [CREDIT_REPOSITORY, CreditMetricsService],
})
export class InfrastructureModule {}
