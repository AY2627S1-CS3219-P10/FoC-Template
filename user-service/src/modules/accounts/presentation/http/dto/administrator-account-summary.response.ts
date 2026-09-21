import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus } from '../../../domain/account-status.js';

export class AdministratorAccountSummaryResponse {
  @ApiProperty({ example: 'student@u.nus.edu' })
  email!: string;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
