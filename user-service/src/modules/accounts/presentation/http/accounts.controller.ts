import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import { EmailAvailabilityRateLimitError } from '../../application/errors/email-availability-rate-limit.error.js';
import { EmailVerificationError } from '../../application/errors/email-verification.error.js';
import { VerificationEmailRateLimitError } from '../../application/errors/verification-email-rate-limit.error.js';
import { CheckEmailAvailabilityUseCase } from '../../application/use-cases/check-email-availability.use-case.js';
import { ResendVerificationEmailUseCase } from '../../application/use-cases/resend-verification-email.use-case.js';
import { RegisterWithEmailVerificationUseCase } from '../../application/use-cases/register-with-email-verification.use-case.js';
import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import {
  PUBLIC_ENDPOINT_RATE_LIMITER,
  type PublicEndpointRateLimiterPort,
} from '../../application/ports/public-endpoint-rate-limiter.port.js';
import { CheckEmailAvailabilityRequest } from './dto/check-email-availability.request.js';
import { CheckEmailAvailabilityResponse } from './dto/check-email-availability.response.js';
import { RegisterAccountRequest } from './dto/register-account.request.js';
import { RegisterAccountResponse } from './dto/register-account.response.js';
import { ResendVerificationEmailRequest } from './dto/resend-verification-email.request.js';
import { VerifyEmailRequest } from './dto/verify-email.request.js';
import { enforcePublicEndpointRateLimit } from './security/enforce-public-endpoint-rate-limit.js';

interface HeaderResponse {
  header(name: string, value: string): unknown;
}

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly checkEmailAvailabilityUseCase: CheckEmailAvailabilityUseCase,
    private readonly registerAccountUseCase: RegisterWithEmailVerificationUseCase,
    private readonly resendVerificationEmailUseCase: ResendVerificationEmailUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(PUBLIC_ENDPOINT_RATE_LIMITER)
    private readonly publicEndpointRateLimiter: PublicEndpointRateLimiterPort,
  ) {}

  @Post('check-email')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Check whether an NUS email can be registered' })
  @ApiOkResponse({ type: CheckEmailAvailabilityResponse })
  @ApiBadRequestResponse({ description: 'NUS email address is invalid.' })
  @ApiTooManyRequestsResponse({
    description: 'Email availability check rate limit exceeded.',
    headers: {
      'Retry-After': {
        description: 'Seconds until another request may be attempted.',
        schema: { type: 'integer' },
      },
    },
  })
  async checkEmail(
    @Ip() clientIdentifier: string,
    @Body() request: CheckEmailAvailabilityRequest,
    @Res({ passthrough: true }) reply: HeaderResponse,
  ): Promise<CheckEmailAvailabilityResponse> {
    try {
      return await this.checkEmailAvailabilityUseCase.execute({
        clientIdentifier,
        email: request.email,
      });
    } catch (error: unknown) {
      if (error instanceof EmailAvailabilityRateLimitError) {
        reply.header('Retry-After', error.retryAfterSeconds.toString());
      }

      this.rethrowAsHttpException(error);
    }
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a student account' })
  @ApiCreatedResponse({ type: RegisterAccountResponse })
  @ApiBadRequestResponse({ description: 'Registration details are invalid.' })
  @ApiConflictResponse({
    description: 'Username, email, or phone number is already registered.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Registration rate limit exceeded.',
  })
  async register(
    @Body() request: RegisterAccountRequest,
    @Ip() clientIdentifier: string,
    @Res({ passthrough: true }) reply: HeaderResponse,
  ): Promise<RegisterAccountResponse> {
    try {
      await enforcePublicEndpointRateLimit(
        this.publicEndpointRateLimiter,
        reply,
        'register',
        clientIdentifier,
        request.email.trim().toLowerCase(),
      );
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

  @Post('verify-email/resend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Request another email verification code' })
  @ApiNoContentResponse({
    description: 'The request was accepted without revealing account state.',
  })
  @ApiBadRequestResponse({ description: 'The email address is invalid.' })
  @ApiTooManyRequestsResponse({
    description: 'Verification email resend limit exceeded.',
    headers: {
      'Retry-After': {
        description: 'Seconds until another request may be attempted.',
        schema: { type: 'integer' },
      },
    },
  })
  async resendVerificationEmail(
    @Body() request: ResendVerificationEmailRequest,
    @Res({ passthrough: true }) reply: HeaderResponse,
  ): Promise<void> {
    try {
      await this.resendVerificationEmailUseCase.execute(request);
    } catch (error: unknown) {
      if (error instanceof VerificationEmailRateLimitError) {
        reply.header('Retry-After', error.retryAfterSeconds.toString());
      }

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
  @ApiTooManyRequestsResponse({
    description: 'Verification rate limit exceeded.',
  })
  async verifyEmail(
    @Body() request: VerifyEmailRequest,
    @Ip() clientIdentifier: string,
    @Res({ passthrough: true }) reply: HeaderResponse,
  ): Promise<void> {
    try {
      await enforcePublicEndpointRateLimit(
        this.publicEndpointRateLimiter,
        reply,
        'verify-email',
        clientIdentifier,
        request.email.trim().toLowerCase(),
      );
      await this.verifyEmailUseCase.execute(request);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  private rethrowAsHttpException(error: unknown): never {
    if (error instanceof EmailAvailabilityRateLimitError) {
      throw new HttpException(
        {
          code: error.code,
          field: error.field,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (error instanceof VerificationEmailRateLimitError) {
      throw new HttpException(
        {
          code: error.code,
          field: error.field,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
