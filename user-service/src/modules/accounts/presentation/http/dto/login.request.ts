/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of login request code (LoginRequest).
 * Author review: Checked LoginRequest validation decorators (IsString, IsNotEmpty, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';
import { PASSWORD_MAXIMUM_LENGTH } from '../../../domain/password-policy.js';

export class LoginRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Strong!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  password!: string;
}
