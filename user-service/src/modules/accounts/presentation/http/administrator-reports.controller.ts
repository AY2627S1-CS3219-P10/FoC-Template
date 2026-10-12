import {
  ConflictException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { UserReportError } from '../../application/errors/user-report.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import type { UserReportRecord } from '../../application/ports/user-report-repository.port.js';
import { ListUserReportsUseCase } from '../../application/use-cases/list-user-reports.use-case.js';
import { ResolveUserReportUseCase } from '../../application/use-cases/resolve-user-report.use-case.js';
import { UserReportResponse } from './dto/user-report.response.js';
import { AdministratorOnly } from './security/administrator-only.decorator.js';
import { CurrentAccount } from './security/authenticated-account.js';

@ApiTags('administrator reports')
@AdministratorOnly()
@Controller('admin/reports')
export class AdministratorReportsController {
  constructor(
    private readonly listReports: ListUserReportsUseCase,
    private readonly resolveReport: ResolveUserReportUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List user reports for administrator review' })
  @ApiOkResponse({ type: [UserReportResponse] })
  async list(): Promise<UserReportResponse[]> {
    return (await this.listReports.execute()).map((report) =>
      this.toResponse(report),
    );
  }

  @Patch(':reportId/resolve')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Mark a user report as resolved' })
  @ApiOkResponse({ type: UserReportResponse })
  @ApiNotFoundResponse({ description: 'Report does not exist.' })
  @ApiConflictResponse({ description: 'Report is already resolved.' })
  async resolve(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ): Promise<UserReportResponse> {
    try {
      return this.toResponse(
        await this.resolveReport.execute({
          reportId,
          resolvedByAdminId: actor.id,
        }),
      );
    } catch (error: unknown) {
      if (!(error instanceof UserReportError)) {
        throw error;
      }
      const response = { code: error.code, message: error.message };
      if (error.code === 'REPORT_NOT_FOUND') {
        throw new NotFoundException({ ...response, statusCode: 404 });
      }
      throw new ConflictException({ ...response, statusCode: 409 });
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
