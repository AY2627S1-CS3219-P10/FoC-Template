import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { TemporarySuspensionError } from '../../application/errors/temporary-suspension.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import { SuspendAccountUseCase } from '../../application/use-cases/suspend-account.use-case.js';
import { SuspendAccountRequest } from './dto/suspend-account.request.js';
import { TemporarySuspensionResponse } from './dto/temporary-suspension.response.js';
import { AdministratorOnly } from './security/administrator-only.decorator.js';
import { CurrentAccount } from './security/authenticated-account.js';

@ApiTags('administrator accounts')
@AdministratorOnly()
@Controller('admin/accounts')
export class AdministratorSuspensionsController {
  constructor(private readonly suspendAccount: SuspendAccountUseCase) {}

  @Patch(':accountId/suspension')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Temporarily suspend an account and revoke sessions',
  })
  @ApiOkResponse({ type: TemporarySuspensionResponse })
  @ApiBadRequestResponse({ description: 'Suspension expiry is invalid.' })
  @ApiForbiddenResponse({ description: 'Self-suspension is forbidden.' })
  @ApiNotFoundResponse({ description: 'Target account does not exist.' })
  @ApiConflictResponse({ description: 'The final usable admin is protected.' })
  async suspend(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Param('accountId', new ParseUUIDPipe()) targetUserId: string,
    @Body() request: SuspendAccountRequest,
  ): Promise<TemporarySuspensionResponse> {
    try {
      const result = await this.suspendAccount.execute({
        actorUserId: actor.id,
        suspendedUntil: new Date(request.suspendedUntil),
        targetUserId,
      });
      return {
        ...result,
        suspendedUntil: result.suspendedUntil.toISOString(),
      };
    } catch (error: unknown) {
      if (!(error instanceof TemporarySuspensionError)) {
        throw error;
      }
      const response = { code: error.code, message: error.message };
      if (error.code === 'SUSPENSION_EXPIRY_INVALID') {
        throw new BadRequestException({ ...response, statusCode: 400 });
      }
      if (error.code === 'ACCOUNT_NOT_FOUND') {
        throw new NotFoundException({ ...response, statusCode: 404 });
      }
      if (error.code === 'LAST_ADMINISTRATOR_REQUIRED') {
        throw new ConflictException({ ...response, statusCode: 409 });
      }
      throw new ForbiddenException({ ...response, statusCode: 403 });
    }
  }
}
