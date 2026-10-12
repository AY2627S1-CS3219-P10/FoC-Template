import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { REPORT_DESCRIPTION_MAX_LENGTH } from '../../../domain/report-description.js';

export class CreateUserReportRequest {
  @ApiProperty({ maxLength: REPORT_DESCRIPTION_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(REPORT_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reportedUserId!: string;
}
