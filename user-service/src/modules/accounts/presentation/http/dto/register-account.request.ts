import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterAccountRequest {
  @ApiProperty({ example: 'student@u.nus.edu' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Strong!Pass', format: 'password', writeOnly: true })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ example: '91234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty({ example: 'Arthur3219' })
  @IsString()
  @IsNotEmpty()
  username!: string;
}
