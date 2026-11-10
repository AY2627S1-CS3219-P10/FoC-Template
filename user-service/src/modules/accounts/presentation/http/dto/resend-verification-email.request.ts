/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of resend verification email request code (ResendVerificationEmailRequest).
 * Author review: Checked ResendVerificationEmailRequest validation decorators (IsString, IsNotEmpty, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';

export class ResendVerificationEmailRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;
}
