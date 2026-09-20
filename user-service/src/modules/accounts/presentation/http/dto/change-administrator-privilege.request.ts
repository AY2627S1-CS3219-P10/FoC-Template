import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ChangeAdministratorPrivilegeRequest {
  @ApiProperty({
    description: 'True promotes the account; false demotes it.',
  })
  @IsBoolean()
  isAdmin!: boolean;
}
