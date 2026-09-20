import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ListSuppliersUseCase } from '../../application/use-cases/list-suppliers.use-case.js';
import { JwtAuthenticationGuard } from '../../platform/auth/jwt-authentication.guard.js';
import { RequireRoles } from '../../platform/auth/require-roles.decorator.js';
import { RolesGuard } from '../../platform/auth/roles.guard.js';
import { UserRole } from '../../platform/auth/user-role.js';
import { SupplierResponse } from './dto/supplier.response.js';

@ApiTags('suppliers')
@ApiBearerAuth('access-token')
@Controller('suppliers')
@UseGuards(JwtAuthenticationGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly listSuppliers: ListSuppliersUseCase) {}

  @Get()
  @RequireRoles(UserRole.Student, UserRole.Admin)
  @ApiOperation({ summary: 'List active suppliers and pickup locations' })
  @ApiOkResponse({ type: [SupplierResponse] })
  @ApiUnauthorizedResponse({
    description: 'A valid, unexpired user-service access token is required.',
  })
  list(): Promise<SupplierResponse[]> {
    return this.listSuppliers.execute();
  }
}
