import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccountAlreadyExistsError } from '../../application/errors/account-already-exists.error.js';
import { RegisterAccountUseCase } from '../../application/use-cases/register-account.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import { RegisterAccountRequest } from './dto/register-account.request.js';
import { RegisterAccountResponse } from './dto/register-account.response.js';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly registerAccountUseCase: RegisterAccountUseCase,
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

      throw error;
    }
  }
}
