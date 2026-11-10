/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update supplier request code (UpdateSupplierRequest).
 * Author review: Checked UpdateSupplierRequest validation decorators (IsOptional, IsBoolean, IsString) and optional fields; standardized property formatting and annotations.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { SUPPLIER_CATEGORIES } from '../../../domain/supplier-input.js';

export class UpdateSupplierRequest {
  @ApiPropertyOptional({
    description: 'Confirm this is distinct from the returned location matches.',
  })
  @IsOptional()
  @IsBoolean()
  confirmDistinctOutlet?: boolean;
  @ApiPropertyOptional({ example: 'Starbucks Coffee' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: SUPPLIER_CATEGORIES, example: 'FOOD_COFFEE' })
  @IsOptional()
  @IsString()
  @IsIn(SUPPLIER_CATEGORIES)
  category?: string;
}
