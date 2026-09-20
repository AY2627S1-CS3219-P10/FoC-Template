import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import { AuthenticationError } from '../../application/errors/authentication.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import type { AccountProfile } from '../../application/ports/profile-repository.port.js';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case.js';
import { GetProfileUseCase } from '../../application/use-cases/get-profile.use-case.js';
import { UpdatePhoneNumberUseCase } from '../../application/use-cases/update-phone-number.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import { AccountProfileResponse } from './dto/account-profile.response.js';
import { ChangePasswordRequest } from './dto/change-password.request.js';
import { UpdatePhoneNumberRequest } from './dto/update-phone-number.request.js';
import { BearerAuthenticationGuard } from './security/bearer-authentication.guard.js';
import { CurrentAccount } from './security/authenticated-account.js';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(BearerAuthenticationGuard)
@Controller('accounts/me')
export class ProfileController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly updatePhoneNumberUseCase: UpdatePhoneNumberUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get the authenticated account profile' })
  @ApiOkResponse({ type: AccountProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Access token is invalid.' })
  async getProfile(
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<AccountProfileResponse> {
    return this.toResponse(await this.getProfileUseCase.execute(account.id));
  }

  @Patch('phone-number')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Change the authenticated account phone number' })
  @ApiOkResponse({ type: AccountProfileResponse })
  @ApiBadRequestResponse({ description: 'Phone number is invalid.' })
  @ApiConflictResponse({ description: 'Phone number is already registered.' })
  @ApiUnauthorizedResponse({ description: 'Access token is invalid.' })
  async updatePhoneNumber(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() request: UpdatePhoneNumberRequest,
  ): Promise<AccountProfileResponse> {
    try {
      return this.toResponse(
        await this.updatePhoneNumberUseCase.execute({
          phoneNumber: request.phoneNumber,
          userId: account.id,
        }),
      );
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Patch('password')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Change the authenticated account password and revoke all sessions',
  })
  @ApiNoContentResponse({ description: 'Password changed; sign in again.' })
  @ApiBadRequestResponse({ description: 'New password is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'Access token or current password is invalid.',
  })
  async changePassword(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() request: ChangePasswordRequest,
  ): Promise<void> {
    try {
      await this.changePasswordUseCase.execute({
        ...request,
        userId: account.id,
      });
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  private rethrowAsHttpException(error: unknown): never {
    if (error instanceof AccountValidationError) {
      throw new BadRequestException({
        code: error.code,
        field: error.field,
        message: error.message,
        statusCode: 400,
      });
    }

    if (error instanceof AccountAlreadyExistsError) {
      throw new ConflictException({
        code: error.code,
        field: error.field,
        message: error.message,
        statusCode: 409,
      });
    }

    if (error instanceof AuthenticationError) {
      throw new UnauthorizedException({
        code: error.code,
        message: error.message,
        statusCode: 401,
      });
    }

    throw error;
  }

  private toResponse(profile: AccountProfile): AccountProfileResponse {
    return {
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      emailVerifiedAt: profile.emailVerifiedAt?.toISOString() ?? null,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
