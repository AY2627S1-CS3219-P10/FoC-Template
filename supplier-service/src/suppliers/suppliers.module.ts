import { Module } from '@nestjs/common';

import { AdminSuppliersController } from '../api/http/admin-suppliers.controller.js';
import { SuppliersController } from '../api/http/suppliers.controller.js';
import { CreateSupplierUseCase } from '../application/use-cases/create-supplier.use-case.js';
import { ListSuppliersUseCase } from '../application/use-cases/list-suppliers.use-case.js';
import { UpdateSupplierUseCase } from '../application/use-cases/update-supplier.use-case.js';
import { PrismaSupplierCatalogRepository } from '../infrastructure/persistence/prisma-supplier-catalog.repository.js';
import { AuthModule } from '../platform/auth/auth.module.js';
import { DatabaseModule } from '../platform/database/database.module.js';
import { PrismaService } from '../platform/database/prisma.service.js';

@Module({
  controllers: [AdminSuppliersController, SuppliersController],
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
      provide: CreateSupplierUseCase,
      useFactory: (
        repository: PrismaSupplierCatalogRepository,
      ): CreateSupplierUseCase => new CreateSupplierUseCase(repository),
    },
    {
      inject: [PrismaSupplierCatalogRepository],
      provide: ListSuppliersUseCase,
      useFactory: (
        repository: PrismaSupplierCatalogRepository,
      ): ListSuppliersUseCase => new ListSuppliersUseCase(repository),
    },
    {
      inject: [PrismaSupplierCatalogRepository],
      provide: UpdateSupplierUseCase,
      useFactory: (
        repository: PrismaSupplierCatalogRepository,
      ): UpdateSupplierUseCase => new UpdateSupplierUseCase(repository),
    },
  ],
})
export class SuppliersModule {}
