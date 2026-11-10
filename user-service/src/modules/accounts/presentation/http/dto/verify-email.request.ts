/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of verify email request code (VerifyEmailRequest).
 * Author review: Checked VerifyEmailRequest validation decorators (IsString, IsNotEmpty, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';

export class VerifyEmailRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;

  @ApiProperty({ example: '042731' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
