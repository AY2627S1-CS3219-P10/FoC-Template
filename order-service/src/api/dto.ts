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
import { ITEM_TYPES, MAX_OFFERED_CREDITS } from '../domain/errand';
import type { ItemType } from '../domain/errand';
import { ERRAND_STATUSES } from '../domain/lifecycle';
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
  @ApiProperty({ minimum: 1, maximum: MAX_OFFERED_CREDITS })
  @IsInt()
  @Min(1)
  @Max(MAX_OFFERED_CREDITS)
  offeredCredits!: number;
  @ApiPropertyOptional({
    enum: ITEM_TYPES,
    default: 'NON_PERISHABLE',
    description:
      'D-018: FOOD expires 2 h after creation, NON_PERISHABLE 24 h. Cannot be edited later.',
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsIn(ITEM_TYPES)
  itemType?: ItemType;
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
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_OFFERED_CREDITS })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_OFFERED_CREDITS)
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
export class ManageErrandsDto extends ListErrandsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Administrators only: list this requester's errands instead of all",
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsUUID('4')
  requesterId?: string;
}
export class ErrandResponse extends CreateErrandDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  requesterUsername?: string | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) requesterId!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) courierId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  courierUsername?: string | null;
  @ApiProperty({ enum: ERRAND_STATUSES })
  status!: string;
  @ApiProperty() pickupSupplierName!: string;
  @ApiProperty() pickupLocationLabel!: string;
  @ApiProperty({ minimum: 0 }) version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  acceptedAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  pickedUpAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deliveredAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  disputedAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  completedAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  cancelledAt?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiredAt?: string | null;
  @ApiProperty({
    format: 'date-time',
    description:
      'createdAt + 2 h (FOOD) or 24 h (NON_PERISHABLE); never moves, even when the errand reopens',
  })
  expiresAt!: string;
  @ApiPropertyOptional({
    enum: ['REQUESTER_CONFIRMED', 'AUTO_TIMEOUT'],
    nullable: true,
  })
  completionMethod?: string | null;
  @ApiPropertyOptional({
    description:
      'Details only (FR4.2.2): true while the errand is OPEN and unassigned',
  })
  availableForAcceptance?: boolean;
}
export class OperationResponse {
  @ApiProperty({ format: 'uuid' }) operationId!: string;
  @ApiProperty({ enum: ['PENDING', 'SUCCEEDED', 'FAILED'] }) status!: string;
  @ApiProperty({ type: ErrandResponse, nullable: true })
  errand!: ErrandResponse | null;
}
