import { ApiProperty } from '@nestjs/swagger';

export class TemporarySuspensionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  suspendedUntil!: string;

  @ApiProperty()
  username!: string;
}
