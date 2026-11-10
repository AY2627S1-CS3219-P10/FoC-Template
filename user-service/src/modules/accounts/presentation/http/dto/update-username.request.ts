/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update username request code (UpdateUsernameRequest).
 * Author review: Checked UpdateUsernameRequest validation decorators (IsString, IsNotEmpty, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { USERNAME_MAXIMUM_LENGTH } from '../../../domain/username.js';

export class UpdateUsernameRequest {
  @ApiProperty({ example: 'Arthur2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAXIMUM_LENGTH)
  username!: string;
}
