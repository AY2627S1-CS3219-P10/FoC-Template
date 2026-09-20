import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RefreshTokenRequest {
  @ApiProperty({
    description: 'Opaque refresh token returned by login or refresh.',
    example: 'Jxk9vXwzVJXJGTXfhbzW7dW7x2F7DxL-zQJdKqcVbHQ',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  refreshToken!: string;
}
