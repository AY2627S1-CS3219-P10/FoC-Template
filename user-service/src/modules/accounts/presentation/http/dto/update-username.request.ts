import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateUsernameRequest {
  @ApiProperty({ example: 'Arthur2026' })
  @IsString()
  @IsNotEmpty()
  username!: string;
}
