/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of update phone number request code (UpdatePhoneNumberRequest).
 * Author review: Checked UpdatePhoneNumberRequest validation decorators (IsString, IsNotEmpty) and optional fields; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePhoneNumberRequest {
  @ApiProperty({ example: '91234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}
