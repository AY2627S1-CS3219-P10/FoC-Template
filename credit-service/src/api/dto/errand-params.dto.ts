/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of errand params dto code (ErrandParamsDto, UserParamsDto).
 * Author review: Checked ErrandParamsDto, UserParamsDto validation decorators (IsUUID) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ErrandParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  errandId!: string;
}

export class UserParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;
}
