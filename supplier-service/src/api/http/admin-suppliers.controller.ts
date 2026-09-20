import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SupplierAlreadyExistsError } from '../../application/errors/supplier-already-exists.error.js';
import { CreateSupplierUseCase } from '../../application/use-cases/create-supplier.use-case.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import { JwtAuthenticationGuard } from '../../platform/auth/jwt-authentication.guard.js';
import { RequireRoles } from '../../platform/auth/require-roles.decorator.js';
import { RolesGuard } from '../../platform/auth/roles.guard.js';
import { UserRole } from '../../platform/auth/user-role.js';
import { CreateSupplierRequest } from './dto/create-supplier.request.js';
import { SupplierResponse } from './dto/supplier.response.js';

@ApiTags('admin suppliers')
@ApiBearerAuth('access-token')
@Controller('admin/suppliers')
@UseGuards(JwtAuthenticationGuard, RolesGuard)
@RequireRoles(UserRole.Admin)
export class AdminSuppliersController {
  constructor(private readonly createSupplier: CreateSupplierUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Create a supplier and its first pickup location' })
  @ApiCreatedResponse({ type: SupplierResponse })
  @ApiBadRequestResponse({ description: 'Supplier details are invalid.' })
  @ApiUnauthorizedResponse({
    description: 'A valid, unexpired user-service access token is required.',
  })
  @ApiForbiddenResponse({ description: 'Administrator role is required.' })
  @ApiConflictResponse({
    description: 'The supplier or supplier-location label already exists.',
  })
  async create(
    @Body() request: CreateSupplierRequest,
  ): Promise<SupplierResponse> {
    try {
      return await this.createSupplier.execute(request);
    } catch (error: unknown) {
      if (error instanceof SupplierValidationError) {
        throw new BadRequestException({
          code: error.code,
          field: error.field,
          message: error.message,
          statusCode: 400,
        });
      }

      if (error instanceof SupplierAlreadyExistsError) {
        throw new ConflictException({
          code: error.code,
          field: error.field,
          message: error.message,
          statusCode: 409,
        });
      }

      throw error;
    }
  }
}
