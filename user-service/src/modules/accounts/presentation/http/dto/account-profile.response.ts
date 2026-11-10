/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of account profile response code (AccountProfileResponse).
 * Author review: Checked AccountProfileResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus } from '../../../domain/account-status.js';

export class AccountProfileResponse {
  @ApiProperty({ format: 'date-time', nullable: true })
  suspendedUntil!: string | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: 'student@u.nus.edu' })
  email!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ example: '91234567' })
  phoneNumber!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
