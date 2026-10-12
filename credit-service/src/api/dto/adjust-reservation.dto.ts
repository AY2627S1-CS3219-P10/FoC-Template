import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class AdjustReservationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') operationId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') requesterId!: string;
  @ApiProperty({ minimum: 1, maximum: 2000000000 }) @IsInt() @Min(1) @Max(2000000000) expectedAmount!: number;
  @ApiProperty({ minimum: 1, maximum: 2000000000 }) @IsInt() @Min(1) @Max(2000000000) amount!: number;
}
