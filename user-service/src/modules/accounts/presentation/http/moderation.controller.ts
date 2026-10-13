import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ModerationError } from '../../application/errors/moderation.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import type { UserReport } from '../../application/ports/moderation-repository.port.js';
import {
  ReportUserUseCase,
  ResolveReportUseCase,
  SuspendAccountUseCase,
  ViewReportsUseCase,
} from '../../application/use-cases/moderation.use-cases.js';
import {
  CreateReportRequest,
  ListReportsQuery,
  SuspendAccountRequest,
  SuspensionResponse,
  UserReportResponse,
} from './dto/moderation.dto.js';
import { AdministratorOnly } from './security/administrator-only.decorator.js';
import { CurrentAccount } from './security/authenticated-account.js';
import { BearerAuthenticationGuard } from './security/bearer-authentication.guard.js';

function rethrowModerationError(error: unknown): never {
  if (!(error instanceof ModerationError)) throw error;
  const response = { code: error.code, message: error.message };
  if (['ACCOUNT_NOT_FOUND', 'REPORT_NOT_FOUND'].includes(error.code))
    throw new NotFoundException(response);
  if (
    ['LAST_ADMINISTRATOR_REQUIRED', 'ACCOUNT_NOT_SUSPENDABLE'].includes(
      error.code,
    )
  )
    throw new ConflictException(response);
  if (
    [
      'SELF_REPORT_FORBIDDEN',
      'SELF_SUSPENSION_FORBIDDEN',
      'ADMINISTRATOR_PRIVILEGES_REQUIRED',
    ].includes(error.code)
  )
    throw new ForbiddenException(response);
  throw new BadRequestException(response);
}
function reportResponse(report: UserReport): UserReportResponse {
  return {
    ...report,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  };
}

@ApiTags('user reports')
@ApiBearerAuth()
@UseGuards(BearerAuthenticationGuard)
@Controller('reports')
export class UserReportsController {
  constructor(private readonly reportUser: ReportUserUseCase) {}
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Report another user; reporter identity comes from the live session',
  })
  @ApiCreatedResponse({ type: UserReportResponse })
  @ApiBadRequestResponse({ description: 'Invalid target ID or description.' })
  @ApiUnauthorizedResponse({
    description: 'A valid active session is required.',
  })
  @ApiForbiddenResponse({ description: 'Self-report is forbidden.' })
  @ApiNotFoundResponse({ description: 'The reported user does not exist.' })
  async create(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Body() request: CreateReportRequest,
  ): Promise<UserReportResponse> {
    try {
      return reportResponse(
        await this.reportUser.execute({
          reporterUserId: actor.id,
          reportedUserId: request.reportedUserId,
          description: request.description,
        }),
      );
    } catch (error) {
      rethrowModerationError(error);
    }
  }
}

@ApiTags('administrator reports')
@AdministratorOnly()
@Controller('admin/reports')
export class AdministratorReportsController {
  constructor(
    private readonly viewReports: ViewReportsUseCase,
    private readonly resolveReport: ResolveReportUseCase,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List reports with safe reporter and target identities',
  })
  @ApiOkResponse({ type: [UserReportResponse] })
  @ApiBadRequestResponse({ description: 'Invalid filter or pagination.' })
  async list(@Query() query: ListReportsQuery): Promise<UserReportResponse[]> {
    return (
      await this.viewReports.list({
        status: query.status,
        limit: Number(query.limit ?? 50),
        offset: Number(query.offset ?? 0),
      })
    ).map(reportResponse);
  }
  @Get(':reportId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'View a report' })
  @ApiOkResponse({ type: UserReportResponse })
  @ApiNotFoundResponse({ description: 'Report does not exist.' })
  async find(
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ): Promise<UserReportResponse> {
    try {
      return reportResponse(await this.viewReports.find(reportId));
    } catch (error) {
      rethrowModerationError(error);
    }
  }
  @Patch(':reportId/resolve')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Resolve a report idempotently; does not suspend the reported user',
  })
  @ApiOkResponse({ type: UserReportResponse })
  @ApiNotFoundResponse({ description: 'Report does not exist.' })
  async resolve(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ): Promise<UserReportResponse> {
    try {
      return reportResponse(
        await this.resolveReport.execute({ reportId, actorUserId: actor.id }),
      );
    } catch (error) {
      rethrowModerationError(error);
    }
  }
}

@ApiTags('administrator accounts')
@AdministratorOnly()
@Controller('admin/accounts')
export class AdministratorSuspensionsController {
  constructor(private readonly suspendAccount: SuspendAccountUseCase) {}
  @Patch(':accountId/suspension')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Temporarily suspend a user and revoke all sessions',
  })
  @ApiOkResponse({ type: SuspensionResponse })
  @ApiBadRequestResponse({
    description: 'Expiry must be a future ISO 8601 timestamp with a timezone.',
  })
  @ApiForbiddenResponse({
    description: 'Self-suspension or inactive administrator.',
  })
  @ApiNotFoundResponse({ description: 'Target account does not exist.' })
  @ApiConflictResponse({
    description: 'Last usable administrator or incompatible permanent status.',
  })
  async suspend(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Param('accountId', new ParseUUIDPipe()) targetUserId: string,
    @Body() request: SuspendAccountRequest,
  ): Promise<SuspensionResponse> {
    try {
      const result = await this.suspendAccount.execute({
        actorUserId: actor.id,
        targetUserId,
        suspendedUntil: new Date(request.suspendedUntil),
      });
      return {
        ...result,
        status: 'SUSPENDED',
        suspendedUntil: result.suspendedUntil.toISOString(),
      };
    } catch (error) {
      rethrowModerationError(error);
    }
  }
}
