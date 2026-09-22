import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { SUPPLIER_CATEGORIES } from '../../../domain/supplier-input.js';

export class UpdateSupplierRequest {
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
