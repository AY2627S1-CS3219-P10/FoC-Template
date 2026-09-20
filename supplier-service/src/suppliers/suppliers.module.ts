import { Module } from '@nestjs/common';

import { SuppliersController } from '../api/http/suppliers.controller.js';
import { ListSuppliersUseCase } from '../application/use-cases/list-suppliers.use-case.js';
import { PrismaSupplierCatalogRepository } from '../infrastructure/persistence/prisma-supplier-catalog.repository.js';
import { AuthModule } from '../platform/auth/auth.module.js';
import { DatabaseModule } from '../platform/database/database.module.js';
import { PrismaService } from '../platform/database/prisma.service.js';

@Module({
  controllers: [SuppliersController],
  imports: [AuthModule, DatabaseModule],
  providers: [
    {
      inject: [PrismaService],
      provide: PrismaSupplierCatalogRepository,
      useFactory: (prisma: PrismaService): PrismaSupplierCatalogRepository =>
        new PrismaSupplierCatalogRepository(prisma),
    },
    {
      inject: [PrismaSupplierCatalogRepository],
      provide: ListSuppliersUseCase,
      useFactory: (
        repository: PrismaSupplierCatalogRepository,
      ): ListSuppliersUseCase => new ListSuppliersUseCase(repository),
    },
  ],
})
export class SuppliersModule {}
