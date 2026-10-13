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
