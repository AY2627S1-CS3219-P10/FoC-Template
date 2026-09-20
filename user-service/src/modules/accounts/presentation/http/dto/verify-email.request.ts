import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyEmailRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '042731' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
