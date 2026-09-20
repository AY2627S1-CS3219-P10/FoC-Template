import {
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

import { AdministratorPrivilegeError } from '../../application/errors/administrator-privilege.error.js';
import type { AuthenticatedAccount } from '../../application/ports/authentication-repository.port.js';
import { ChangeAdministratorPrivilegeUseCase } from '../../application/use-cases/change-administrator-privilege.use-case.js';
import { AdministratorPrivilegeResponse } from './dto/administrator-privilege.response.js';
import { ChangeAdministratorPrivilegeRequest } from './dto/change-administrator-privilege.request.js';
import { AdministratorOnly } from './security/administrator-only.decorator.js';
import { CurrentAccount } from './security/authenticated-account.js';

@ApiTags('administrator accounts')
@AdministratorOnly()
@Controller('admin/accounts')
export class AdministratorAccountsController {
  constructor(
    private readonly changeAdministratorPrivilege: ChangeAdministratorPrivilegeUseCase,
  ) {}

  @Patch(':accountId/administrator')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Promote or demote an account and revoke its active sessions',
  })
  @ApiOkResponse({ type: AdministratorPrivilegeResponse })
  @ApiBadRequestResponse({ description: 'Account ID or request is invalid.' })
  @ApiForbiddenResponse({
    description:
      'Administrator privileges are required or self-change was attempted.',
  })
  @ApiNotFoundResponse({ description: 'Target account does not exist.' })
  @ApiConflictResponse({
    description: 'Demotion would leave the system without an administrator.',
  })
  async changePrivilege(
    @CurrentAccount() actor: AuthenticatedAccount,
    @Param('accountId', new ParseUUIDPipe()) targetUserId: string,
    @Body() request: ChangeAdministratorPrivilegeRequest,
  ): Promise<AdministratorPrivilegeResponse> {
    try {
      return await this.changeAdministratorPrivilege.execute({
        actorUserId: actor.id,
        isAdmin: request.isAdmin,
        targetUserId,
      });
    } catch (error: unknown) {
      this.rethrowAsHttpException(error);
    }
  }

  private rethrowAsHttpException(error: unknown): never {
    if (!(error instanceof AdministratorPrivilegeError)) {
      throw error;
    }

    const response = {
      code: error.code,
      message: error.message,
    };

    if (error.code === 'ACCOUNT_NOT_FOUND') {
      throw new NotFoundException({ ...response, statusCode: 404 });
    }

    if (error.code === 'LAST_ADMINISTRATOR_REQUIRED') {
      throw new ConflictException({ ...response, statusCode: 409 });
    }

    throw new ForbiddenException({ ...response, statusCode: 403 });
  }
}
