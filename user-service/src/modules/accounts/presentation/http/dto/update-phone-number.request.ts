import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePhoneNumberRequest {
  @ApiProperty({ example: '91234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}
