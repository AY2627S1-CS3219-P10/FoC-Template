import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { PASSWORD_MAXIMUM_LENGTH } from '../../../domain/password-policy.js';

export class ChangePasswordRequest {
  @ApiProperty({ example: 'Current!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  currentPassword!: string;

  @ApiProperty({ example: 'NewStrong!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  newPassword!: string;
}
