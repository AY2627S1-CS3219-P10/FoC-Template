// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import { ApiProperty } from '@nestjs/swagger';

import type { SupplierCategory } from '../../../domain/supplier-catalog.js';
import { SupplierLocationResponse } from './supplier-location.response.js';
import {
  SUPPLIER_TAGS,
  type SupplierTag,
} from '../../../domain/supplier-categories.js';

export class SupplierResponse {
  @ApiProperty({
    enum: SUPPLIER_TAGS,
    isArray: true,
    example: ['FOOD', 'BEVERAGES'],
  })
  categories!: SupplierTag[];
  @ApiProperty({ example: '10000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ example: 'NUS Co-op' })
  name!: string;

  @ApiProperty({
    enum: ['FOOD', 'FOOD_COFFEE', 'PRINTING', 'SHOPPING'],
    example: 'SHOPPING',
    deprecated: true,
  })
  category!: SupplierCategory;

  @ApiProperty({ type: () => [SupplierLocationResponse] })
  locations!: SupplierLocationResponse[];
}
