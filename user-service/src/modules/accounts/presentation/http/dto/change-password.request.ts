/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of change password request code (ChangePasswordRequest).
 * Author review: Checked ChangePasswordRequest validation decorators (IsString, IsNotEmpty, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { PASSWORD_MAXIMUM_LENGTH } from '../../../domain/password-policy.js';

export class ChangePasswordRequest {
  @ApiProperty({ example: 'Current!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  currentPassword!: string;

  @ApiProperty({ example: 'NewStrong!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  newPassword!: string;
}
