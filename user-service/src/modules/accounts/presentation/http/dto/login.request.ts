import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';
import { PASSWORD_MAXIMUM_LENGTH } from '../../../domain/password-policy.js';

export class LoginRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Strong!Pass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  password!: string;
}
