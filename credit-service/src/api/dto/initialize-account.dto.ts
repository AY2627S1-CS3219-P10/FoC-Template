/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of initialize account dto code (InitializeAccountDto).
 * Author review: Checked InitializeAccountDto validation decorators (IsUUID) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InitializeAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;
}
