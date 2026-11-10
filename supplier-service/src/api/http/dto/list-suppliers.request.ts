// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
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
