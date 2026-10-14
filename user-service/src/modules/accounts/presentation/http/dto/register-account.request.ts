import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';
import { PASSWORD_MAXIMUM_LENGTH } from '../../../domain/password-policy.js';
import { USERNAME_MAXIMUM_LENGTH } from '../../../domain/username.js';

export class RegisterAccountRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;

  @ApiProperty({ example: 'Strong!Pass', format: 'password', writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAXIMUM_LENGTH)
  password!: string;

  @ApiProperty({ example: '91234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty({ example: 'Arthur3219' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAXIMUM_LENGTH)
  username!: string;
}
