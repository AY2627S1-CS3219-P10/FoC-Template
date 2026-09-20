import { ApiProperty } from '@nestjs/swagger';

import type { SupplierCategory } from '../../../domain/supplier-catalog.js';
import { SupplierLocationResponse } from './supplier-location.response.js';

export class SupplierResponse {
  @ApiProperty({ example: '10000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ example: 'NUS Co-op' })
  name!: string;

  @ApiProperty({
    enum: ['FOOD', 'FOOD_COFFEE', 'PRINTING', 'SHOPPING'],
    example: 'SHOPPING',
  })
  category!: SupplierCategory;

  @ApiProperty({ type: () => [SupplierLocationResponse] })
  locations!: SupplierLocationResponse[];
}
