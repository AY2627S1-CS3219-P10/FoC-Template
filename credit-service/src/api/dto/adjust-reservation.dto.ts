import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { MAX_CREDIT_BALANCE } from '../../domain/credit.constants';

export class AdjustReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  requesterId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_CREDIT_BALANCE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CREDIT_BALANCE)
  targetAmount!: number;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  idempotencyKey!: string;
}
