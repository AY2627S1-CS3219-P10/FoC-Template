/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier-list query validation.
 * Author review: Checked ListSuppliersRequest query validation decorators, optional values, and parsing; standardized field annotations and property layout.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import {
  SUPPLIER_TAGS,
  type SupplierTag,
} from '../../../domain/supplier-categories.js';

export class ListSuppliersRequest {
  @ApiPropertyOptional({
    enum: SUPPLIER_TAGS,
    description:
      'Match suppliers containing this tag. Omit to list all active suppliers.',
    example: 'BEVERAGES',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(SUPPLIER_TAGS)
  category?: SupplierTag;
}
