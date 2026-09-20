import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Strong!Pass' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
