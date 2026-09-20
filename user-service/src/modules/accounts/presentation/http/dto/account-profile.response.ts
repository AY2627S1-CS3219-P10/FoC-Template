import { ApiProperty } from '@nestjs/swagger';

import { AccountStatus } from '../../../domain/account-status.js';

export class AccountProfileResponse {
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: 'student@u.nus.edu' })
  email!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ example: '91234567' })
  phoneNumber!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
