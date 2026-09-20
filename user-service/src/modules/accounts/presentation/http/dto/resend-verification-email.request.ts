import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResendVerificationEmailRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  email!: string;
}
