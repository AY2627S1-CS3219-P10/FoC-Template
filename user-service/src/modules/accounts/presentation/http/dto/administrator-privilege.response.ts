import { ApiProperty } from '@nestjs/swagger';

export class AdministratorPrivilegeResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  isAdmin!: boolean;

  @ApiProperty({ example: 'Arthur3219' })
  username!: string;
}
