/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of register account response code (RegisterAccountResponse).
 * Author review: Checked RegisterAccountResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus } from '../../../domain/account-status.js';

export class RegisterAccountResponse {
  @ApiProperty({ example: '4a84f480-b1cb-4b81-b632-8bb49034b9e7' })
  id!: string;

  @ApiProperty({
    enum: AccountStatus,
    example: AccountStatus.PendingVerification,
  })
  status!: AccountStatus;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
