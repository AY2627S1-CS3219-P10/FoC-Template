/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of change administrator privilege request code (ChangeAdministratorPrivilegeRequest).
 * Author review: Checked ChangeAdministratorPrivilegeRequest validation decorators (IsBoolean) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ChangeAdministratorPrivilegeRequest {
  @ApiProperty({
    description: 'True promotes the account; false demotes it.',
  })
  @IsBoolean()
  isAdmin!: boolean;
}
