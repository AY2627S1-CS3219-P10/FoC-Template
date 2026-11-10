/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of authentication response code (AuthenticationResponse).
 * Author review: Checked AuthenticationResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

class AuthenticatedUserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}

export class AuthenticationResponse {
  @ApiProperty({ description: 'Short-lived JWT access token.' })
  accessToken!: string;

  @ApiProperty({ example: 3600 })
  expiresIn!: number;

  @ApiProperty({ description: 'Single-use opaque refresh token.' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ type: AuthenticatedUserResponse })
  user!: AuthenticatedUserResponse;
}
