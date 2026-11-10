/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update supplier request code (UpdateSupplierRequest).
 * Author review: Checked UpdateSupplierRequest validation decorators (IsOptional, IsBoolean, IsString) and optional fields; standardized property formatting and annotations.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  ValidateIf,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { SUPPLIER_CATEGORIES } from '../../../domain/supplier-input.js';
import { SUPPLIER_TAGS } from '../../../domain/supplier-categories.js';

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

  @ApiPropertyOptional({ enum: SUPPLIER_CATEGORIES, deprecated: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsIn(SUPPLIER_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({
    enum: SUPPLIER_TAGS,
    isArray: true,
    example: ['FOOD', 'BEVERAGES'],
    description:
      'Replace all tags. Supply categories or legacy category, not both.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SUPPLIER_TAGS, { each: true })
  categories?: string[];
}
