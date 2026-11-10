/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of release credits dto code (ReleaseCreditsDto).
 * Author review: Checked ReleaseCreditsDto validation decorators (IsUUID, IsInt, Min) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_CREDIT_BALANCE } from '../../domain/credit.constants';

export class ReleaseCreditsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  requesterId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_CREDIT_BALANCE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CREDIT_BALANCE)
  amount!: number;
}
