import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InitializeAccountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;
}
