import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  ValidateIf,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SUPPLIER_CATEGORIES } from '../../../domain/supplier-input.js';
import { SUPPLIER_TAGS } from '../../../domain/supplier-categories.js';

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class CreateSupplierLocationRequest {
  @ApiProperty({
    description: 'Identifier from GET /api/suppliers/campus-locations',
    example: '20000000-0000-4000-8000-000000000008',
  })
  @IsUUID('4')
  campusLocationId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  floor!: number;

  @ApiProperty({ example: 'Near the main entrance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  locationDescription!: string;

  @ApiProperty({ example: '08:00', pattern: 'HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN)
  opensAt!: string;

  @ApiProperty({ example: '20:00', pattern: 'HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN)
  closesAt!: string;

  @ApiPropertyOptional({ example: 'https://example.com/starbucks-utown.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;
}

export class CreateSupplierRequest {
  @ApiProperty({ example: 'Starbucks' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

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
      'Supply categories instead of legacy category. At least one unique tag is required.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SUPPLIER_TAGS, { each: true })
  categories?: string[];

  @ApiProperty({ type: () => CreateSupplierLocationRequest })
  @Type(() => CreateSupplierLocationRequest)
  @ValidateNested()
  location!: CreateSupplierLocationRequest;

  @ApiPropertyOptional({
    description:
      'Explicitly confirm a different pickup point after reviewing existing matches. A distinct location description is required.',
  })
  @IsOptional()
  @IsBoolean()
  confirmDistinctOutlet?: boolean;
}
