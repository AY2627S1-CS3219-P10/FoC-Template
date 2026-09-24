import { ApiProperty } from '@nestjs/swagger';

export class CheckEmailAvailabilityResponse {
  @ApiProperty({ example: true })
  available!: boolean;
}
