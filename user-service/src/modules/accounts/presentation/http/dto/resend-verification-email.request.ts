import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAXIMUM_LENGTH } from '../../../domain/nus-email.js';

export class ResendVerificationEmailRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAXIMUM_LENGTH)
  email!: string;
}
