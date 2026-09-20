import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import { EmailVerificationError } from '../../application/errors/email-verification.error.js';
import { RegisterAccountUseCase } from '../../application/use-cases/register-account.use-case.js';
import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import { RegisterAccountRequest } from './dto/register-account.request.js';
import { RegisterAccountResponse } from './dto/register-account.response.js';
import { VerifyEmailRequest } from './dto/verify-email.request.js';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly registerAccountUseCase: RegisterAccountUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a student account' })
  @ApiCreatedResponse({ type: RegisterAccountResponse })
  @ApiBadRequestResponse({ description: 'Registration details are invalid.' })
  @ApiConflictResponse({
    description: 'Username, email, or phone number is already registered.',
  })
  async register(
    @Body() request: RegisterAccountRequest,
  ): Promise<RegisterAccountResponse> {
    try {
      const account = await this.registerAccountUseCase.execute(request);

      return {
        id: account.id,
        status: account.status,
        username: account.username,
      };
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Post('verify-email')
  @HttpCode(204)
  @ApiOperation({ summary: 'Verify a student email address' })
  @ApiNoContentResponse({ description: 'Email address verified.' })
  @ApiBadRequestResponse({
    description: 'Verification code is invalid, expired, or exhausted.',
  })
  async verifyEmail(@Body() request: VerifyEmailRequest): Promise<void> {
    try {
      await this.verifyEmailUseCase.execute(request);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  private rethrowAsHttpException(error: unknown): never {
    if (
      error instanceof AccountValidationError ||
      error instanceof EmailVerificationError
    ) {
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

    throw error;
  }
}
