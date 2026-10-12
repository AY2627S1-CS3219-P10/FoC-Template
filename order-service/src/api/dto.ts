import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsIn,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class CreateErrandDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') pickupLocationId!: string;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description!: string;
  @ApiProperty({ minLength: 1, maxLength: 250 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  deliveryDestination!: string;
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  instructions!: string;
  @ApiProperty({ minimum: 1, maximum: 2000000000 })
  @IsInt()
  @Min(1)
  @Max(2000000000)
  offeredCredits!: number;
}
export class EditErrandDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 250 })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  deliveryDestination?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 1000 })
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  instructions?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 2000000000 })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2000000000)
  offeredCredits?: number;
}
export class ListErrandsDto {
  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'credits-highest', 'credits-lowest'],
    default: 'newest',
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(['newest', 'oldest', 'credits-highest', 'credits-lowest'])
  sort?: import('../application/ports').ErrandSort;
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @ValidateIf((_o, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @ValidateIf((_o, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset?: number;
}
export class ErrandResponse extends CreateErrandDto {
  @ApiPropertyOptional({ nullable: true }) requesterUsername?: string | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requesterId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) courierId!: string | null;
  @ApiProperty({
    enum: [
      'OPEN',
      'ACCEPTED',
      'IN_PROGRESS',
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
    ],
  })
  status!: string;
  @ApiProperty() pickupSupplierName!: string;
  @ApiProperty() pickupLocationLabel!: string;
  @ApiProperty({ minimum: 0 }) version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class OperationResponse {
  @ApiProperty({ format: 'uuid' }) operationId!: string;
  @ApiProperty({ enum: ['PENDING', 'SUCCEEDED', 'FAILED'] }) status!: string;
  @ApiProperty({ type: ErrandResponse, nullable: true })
  errand!: ErrandResponse | null;
}
