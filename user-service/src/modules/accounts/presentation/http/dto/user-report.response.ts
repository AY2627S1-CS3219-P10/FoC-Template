import { ApiProperty } from '@nestjs/swagger';

import { UserReportStatus } from '../../../application/ports/user-report-repository.port.js';

export class UserReportAccountResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;
}

export class UserReportResponse {
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserReportAccountResponse })
  reportedUser!: UserReportAccountResponse;

  @ApiProperty({ type: UserReportAccountResponse })
  reporter!: UserReportAccountResponse;

  @ApiProperty({ format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ enum: UserReportStatus })
  status!: UserReportStatus;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
