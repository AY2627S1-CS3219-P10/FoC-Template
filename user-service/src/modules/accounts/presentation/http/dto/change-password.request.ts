import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordRequest {
  @ApiProperty({ example: 'Current!Pass' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'NewStrong!Pass' })
  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}
