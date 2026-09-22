import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SupplierAlreadyExistsError } from '../../application/errors/supplier-already-exists.error.js';
import { SupplierLocationNotFoundError } from '../../application/errors/supplier-location-not-found.error.js';
import { SupplierNotFoundError } from '../../application/errors/supplier-not-found.error.js';
import { CreateSupplierUseCase } from '../../application/use-cases/create-supplier.use-case.js';
import { DeactivateSupplierUseCase } from '../../application/use-cases/deactivate-supplier.use-case.js';
import { UpdateSupplierLocationUseCase } from '../../application/use-cases/update-supplier-location.use-case.js';
import { UpdateSupplierUseCase } from '../../application/use-cases/update-supplier.use-case.js';
import { SupplierValidationError } from '../../domain/supplier-validation.error.js';
import { JwtAuthenticationGuard } from '../../platform/auth/jwt-authentication.guard.js';
import { RequireRoles } from '../../platform/auth/require-roles.decorator.js';
import { RolesGuard } from '../../platform/auth/roles.guard.js';
import { UserRole } from '../../platform/auth/user-role.js';
import { CreateSupplierRequest } from './dto/create-supplier.request.js';
import { SupplierLocationResponse } from './dto/supplier-location.response.js';
import { SupplierResponse } from './dto/supplier.response.js';
import { UpdateSupplierLocationRequest } from './dto/update-supplier-location.request.js';
import { UpdateSupplierRequest } from './dto/update-supplier.request.js';

@ApiTags('admin suppliers')
@ApiBearerAuth('access-token')
@Controller('admin/suppliers')
@UseGuards(JwtAuthenticationGuard, RolesGuard)
@RequireRoles(UserRole.Admin)
export class AdminSuppliersController {
  constructor(
    private readonly createSupplier: CreateSupplierUseCase,
    private readonly deactivateSupplier: DeactivateSupplierUseCase,
    private readonly updateSupplierLocation: UpdateSupplierLocationUseCase,
    private readonly updateSupplier: UpdateSupplierUseCase,
  ) {}

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
      this.rethrowAsHttpException(error);
    }
  }

  @Delete(':supplierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a supplier and its pickup locations' })
  @ApiNoContentResponse({
    description: 'Supplier and pickup locations were deactivated.',
  })
  @ApiBadRequestResponse({ description: 'Supplier identifier is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'A valid, unexpired user-service access token is required.',
  })
  @ApiForbiddenResponse({ description: 'Administrator role is required.' })
  @ApiNotFoundResponse({ description: 'Supplier does not exist.' })
  async deactivate(
    @Param('supplierId', new ParseUUIDPipe({ version: '4' }))
    supplierId: string,
  ): Promise<void> {
    try {
      await this.deactivateSupplier.execute(supplierId);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Patch(':supplierId')
  @ApiOperation({ summary: 'Update a supplier name or category' })
  @ApiOkResponse({ type: SupplierResponse })
  @ApiBadRequestResponse({ description: 'Supplier update is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'A valid, unexpired user-service access token is required.',
  })
  @ApiForbiddenResponse({ description: 'Administrator role is required.' })
  @ApiNotFoundResponse({ description: 'Supplier does not exist.' })
  @ApiConflictResponse({
    description: 'The updated supplier name is already in use.',
  })
  async update(
    @Param('supplierId', new ParseUUIDPipe({ version: '4' }))
    supplierId: string,
    @Body() request: UpdateSupplierRequest,
  ): Promise<SupplierResponse> {
    try {
      return await this.updateSupplier.execute(supplierId, request);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Patch(':supplierId/locations/:locationId')
  @ApiOperation({ summary: 'Update a supplier pickup location' })
  @ApiOkResponse({ type: SupplierLocationResponse })
  @ApiBadRequestResponse({
    description: 'Supplier location update is invalid.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid, unexpired user-service access token is required.',
  })
  @ApiForbiddenResponse({ description: 'Administrator role is required.' })
  @ApiNotFoundResponse({
    description: 'Pickup location does not exist for this supplier.',
  })
  @ApiConflictResponse({
    description: 'The updated supplier location already exists.',
  })
  async updateLocation(
    @Param('supplierId', new ParseUUIDPipe({ version: '4' }))
    supplierId: string,
    @Param('locationId', new ParseUUIDPipe({ version: '4' }))
    locationId: string,
    @Body() request: UpdateSupplierLocationRequest,
  ): Promise<SupplierLocationResponse> {
    try {
      return await this.updateSupplierLocation.execute(
        supplierId,
        locationId,
        request,
      );
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  private rethrowAsHttpException(error: unknown): never {
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

    if (error instanceof SupplierNotFoundError) {
      throw new NotFoundException({
        code: error.code,
        field: error.field,
        message: error.message,
        statusCode: 404,
      });
    }

    if (error instanceof SupplierLocationNotFoundError) {
      throw new NotFoundException({
        code: error.code,
        field: error.field,
        message: error.message,
        statusCode: 404,
      });
    }

    throw error;
  }
}
