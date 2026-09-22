import { Module } from '@nestjs/common';
import { CREDIT_REPOSITORY } from '../application/credit.repository';
import { PrismaCreditRepository } from './prisma-credit.repository';
import { PrismaService } from './prisma.service';

@Module({
  providers: [
    PrismaService,
    PrismaCreditRepository,
    {
      provide: CREDIT_REPOSITORY,
      useExisting: PrismaCreditRepository,
    },
  ],
  exports: [CREDIT_REPOSITORY],
})
export class InfrastructureModule {}
