import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_CREDIT_BALANCE } from '../../domain/credit.constants';

export class ReserveCreditsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  errandId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  requesterId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_CREDIT_BALANCE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CREDIT_BALANCE)
  amount!: number;
}
