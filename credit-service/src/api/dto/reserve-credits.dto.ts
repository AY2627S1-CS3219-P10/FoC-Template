import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class ReserveCreditsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  errandId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  requesterId!: string;

  @ApiProperty({ minimum: 1, maximum: 2_000_000_000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;
}
