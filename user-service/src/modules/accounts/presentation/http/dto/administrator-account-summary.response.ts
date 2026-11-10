/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator account summary response code (AdministratorAccountSummaryResponse).
 * Author review: Checked AdministratorAccountSummaryResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus } from '../../../domain/account-status.js';

export class AdministratorAccountSummaryResponse {
  @ApiProperty({ format: 'date-time', nullable: true })
  suspendedUntil?: Date | null;
  @ApiProperty({ example: 'student@u.nus.edu' })
  email!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
