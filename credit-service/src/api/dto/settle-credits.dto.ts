import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SettleCreditsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  courierId!: string;
}
