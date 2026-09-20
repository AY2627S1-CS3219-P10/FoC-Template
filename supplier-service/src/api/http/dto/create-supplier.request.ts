import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SUPPLIER_CATEGORIES } from '../../../domain/supplier-input.js';

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class CreateSupplierLocationRequest {
  @ApiProperty({ example: 'UTown' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  building!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  floor!: number;

  @ApiProperty({ example: 'Near the main entrance' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  locationDescription!: string;

  @ApiProperty({ example: 1.3048 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 103.7739 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

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

  @ApiProperty({ enum: SUPPLIER_CATEGORIES, example: 'FOOD_COFFEE' })
  @IsString()
  @IsIn(SUPPLIER_CATEGORIES)
  category!: string;

  @ApiProperty({ type: () => CreateSupplierLocationRequest })
  @Type(() => CreateSupplierLocationRequest)
  @ValidateNested()
  location!: CreateSupplierLocationRequest;
}
