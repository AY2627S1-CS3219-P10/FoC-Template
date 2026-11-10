/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator privilege response code (AdministratorPrivilegeResponse).
 * Author review: Checked AdministratorPrivilegeResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

export class AdministratorPrivilegeResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
