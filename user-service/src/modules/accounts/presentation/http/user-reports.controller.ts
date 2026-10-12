import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { UserReportError } from '../../application/errors/user-report.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import type { UserReportRecord } from '../../application/ports/user-report-repository.port.js';
import { CreateUserReportUseCase } from '../../application/use-cases/create-user-report.use-case.js';
import { AccountValidationError } from '../../domain/account-validation.error.js';
import { CreateUserReportRequest } from './dto/create-user-report.request.js';
import { UserReportResponse } from './dto/user-report.response.js';
import { BearerAuthenticationGuard } from './security/bearer-authentication.guard.js';
import { CurrentAccount } from './security/authenticated-account.js';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(BearerAuthenticationGuard)
@Controller('accounts/reports')
export class UserReportsController {
  constructor(private readonly createReport: CreateUserReportUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Report another user for administrator review' })
  @ApiCreatedResponse({ type: UserReportResponse })
  @ApiBadRequestResponse({ description: 'Report details are invalid.' })
  @ApiNotFoundResponse({ description: 'Reported account does not exist.' })
  @ApiUnauthorizedResponse({ description: 'Access token is invalid.' })
  async create(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Body() request: CreateUserReportRequest,
  ): Promise<UserReportResponse> {
    try {
      return this.toResponse(
        await this.createReport.execute({
          ...request,
          reporterUserId: actor.id,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof AccountValidationError) {
        throw new BadRequestException({
          code: error.code,
          field: error.field,
          message: error.message,
          statusCode: 400,
        });
      }
      if (error instanceof UserReportError) {
        const response = { code: error.code, message: error.message };
        if (error.code === 'REPORTED_ACCOUNT_NOT_FOUND') {
          throw new NotFoundException({ ...response, statusCode: 404 });
        }
        throw new BadRequestException({ ...response, statusCode: 400 });
      }
      throw error;
    }
  }

  private toResponse(report: UserReportRecord): UserReportResponse {
    return {
      ...report,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
