/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of find administrator accounts query code (FindAdministratorAccountsQuery).
 * Author review: Checked FindAdministratorAccountsQuery validation decorators (IsOptional, IsString, MaxLength) and optional fields; standardized property formatting and annotations.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FindAdministratorAccountsQuery {
  @ApiPropertyOptional({
    description: 'Case-insensitive username or email substring.',
    example: 'arthur',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  search?: string;
}
