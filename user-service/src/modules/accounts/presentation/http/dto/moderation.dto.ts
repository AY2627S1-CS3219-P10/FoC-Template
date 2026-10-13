import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReportRequest {
  @ApiProperty({ format: 'uuid' }) @IsUUID() reportedUserId!: string;
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;
}
export class ListReportsQuery {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset?: number;
}
export class SuspendAccountRequest {
  @ApiProperty({
    format: 'date-time',
    description:
      'Future ISO 8601 expiry with explicit timezone (Z or UTC offset).',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  suspendedUntil!: string;
}
export class ReportIdentityResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() username!: string;
}
export class UserReportResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) reporterUserId!: string;
  @ApiProperty({ format: 'uuid' }) reportedUserId!: string;
  @ApiProperty({ type: ReportIdentityResponse })
  reporter!: ReportIdentityResponse;
  @ApiProperty({ type: ReportIdentityResponse })
  reportedUser!: ReportIdentityResponse;
  @ApiProperty({ maxLength: 500 }) description!: string;
  @ApiProperty({ enum: ['OPEN', 'RESOLVED'] }) status!: 'OPEN' | 'RESOLVED';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) resolvedAt!:
    string | null;
  @ApiProperty({ type: ReportIdentityResponse, nullable: true })
  resolvedBy!: ReportIdentityResponse | null;
}
export class SuspensionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ enum: ['SUSPENDED'] }) status!: 'SUSPENDED';
  @ApiProperty({ format: 'date-time' }) suspendedUntil!: string;
}
