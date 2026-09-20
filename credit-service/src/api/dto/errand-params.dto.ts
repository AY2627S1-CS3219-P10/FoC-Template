import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ErrandParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  errandId!: string;
}

export class UserParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;
}
