import { ApiPropertyOptional } from '@nestjs/swagger';
import {
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
} from 'class-validator';

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class UpdateSupplierLocationRequest {
  @ApiPropertyOptional({ example: 'Science' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  building?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional({ example: 'Beside the main entrance' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  locationDescription?: string;

  @ApiPropertyOptional({ example: 1.2966 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 103.7801 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: '09:00', pattern: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  opensAt?: string;

  @ApiPropertyOptional({ example: '21:00', pattern: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  closesAt?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/starbucks-science.jpg',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;
}
