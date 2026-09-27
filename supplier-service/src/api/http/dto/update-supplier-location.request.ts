import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export class UpdateSupplierLocationRequest {
  @ApiPropertyOptional({
    description: 'Identifier from GET /api/suppliers/campus-locations',
    example: '20000000-0000-4000-8000-000000000008',
  })
  @IsOptional()
  @IsUUID('4')
  campusLocationId?: string;

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
