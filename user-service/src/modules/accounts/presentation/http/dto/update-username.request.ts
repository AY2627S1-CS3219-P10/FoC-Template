import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { USERNAME_MAXIMUM_LENGTH } from '../../../domain/username.js';

export class UpdateUsernameRequest {
  @ApiProperty({ example: 'Arthur2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAXIMUM_LENGTH)
  username!: string;
}
