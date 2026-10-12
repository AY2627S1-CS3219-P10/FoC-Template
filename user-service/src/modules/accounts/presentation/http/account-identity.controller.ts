import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { GetProfileUseCase } from '../../application/use-cases/get-profile.use-case.js';
import { AuthenticationError } from '../../application/errors/authentication.error.js';
import { BearerAuthenticationGuard } from './security/bearer-authentication.guard.js';

export class AccountIdentityResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() username!: string;
}
@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(BearerAuthenticationGuard)
@Controller('accounts')
export class AccountIdentityController {
  constructor(private readonly profile: GetProfileUseCase) {}
  @Get(':id/identity')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get an account display name without private profile information',
  })
  @ApiOkResponse({ type: AccountIdentityResponse })
  @ApiNotFoundResponse()
  async find(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AccountIdentityResponse> {
    try {
      const profile = await this.profile.execute(id);
      return { id: profile.id, username: profile.username };
    } catch (error: unknown) {
      if (error instanceof AuthenticationError)
        throw new NotFoundException('Account not found.');
      throw error;
    }
  }
}
