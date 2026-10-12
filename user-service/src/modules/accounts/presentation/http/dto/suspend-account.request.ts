import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class SuspendAccountRequest {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  suspendedUntil!: string;
}
