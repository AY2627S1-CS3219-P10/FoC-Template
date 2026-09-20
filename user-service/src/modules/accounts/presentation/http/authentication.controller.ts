import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthenticationError } from '../../application/errors/authentication.error.js';
import { LoginUseCase } from '../../application/use-cases/login.use-case.js';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case.js';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import { AuthenticationResponse } from './dto/authentication.response.js';
import { LoginRequest } from './dto/login.request.js';
import { RefreshTokenRequest } from './dto/refresh-token.request.js';

@ApiTags('authentication')
@Controller('auth')
export class AuthenticationController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Log in and create an authentication session' })
  @ApiOkResponse({ type: AuthenticationResponse })
  @ApiBadRequestResponse({ description: 'Login details are invalid.' })
  @ApiForbiddenResponse({ description: 'Account is not active.' })
  @ApiUnauthorizedResponse({ description: 'Credentials are invalid.' })
  async login(@Body() request: LoginRequest): Promise<AuthenticationResponse> {
    try {
      return await this.loginUseCase.execute(request);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Rotate a refresh token and renew the session' })
  @ApiOkResponse({ type: AuthenticationResponse })
  @ApiBadRequestResponse({ description: 'Refresh token format is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token is invalid, expired, or already used.',
  })
  async refresh(
    @Body() request: RefreshTokenRequest,
  ): Promise<AuthenticationResponse> {
    try {
      return await this.refreshSessionUseCase.execute(request);
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke an authentication session' })
  @ApiNoContentResponse({
    description: 'Session revocation accepted without revealing token state.',
  })
  @ApiBadRequestResponse({ description: 'Refresh token format is invalid.' })
  async logout(@Body() request: RefreshTokenRequest): Promise<void> {
    await this.logoutUseCase.execute(request);
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

    if (error instanceof AuthenticationError) {
      const response = {
        code: error.code,
        message: error.message,
      };

      if (error.code === 'ACCOUNT_NOT_ACTIVE') {
        throw new ForbiddenException({ ...response, statusCode: 403 });
      }

      throw new UnauthorizedException({ ...response, statusCode: 401 });
    }

    throw error;
  }
}
