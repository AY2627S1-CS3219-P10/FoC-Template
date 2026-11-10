/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of check email availability response code (CheckEmailAvailabilityResponse).
 * Author review: Checked CheckEmailAvailabilityResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

export class CheckEmailAvailabilityResponse {
  @ApiProperty({ example: true })
  available!: boolean;
}
