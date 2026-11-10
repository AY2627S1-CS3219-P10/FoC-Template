/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of campus location response code (CampusLocationResponse).
 * Author review: Checked CampusLocationResponse field values and response mappings; standardized property formatting and annotations.
 */

import { ApiProperty } from '@nestjs/swagger';

export class CampusLocationResponse {
  @ApiProperty({ example: '20000000-0000-4000-8000-000000000008' })
  id!: string;

  @ApiProperty({ example: 'Engineering Block E4' })
  building!: string;

  @ApiProperty({ example: 1.2991517 })
  latitude!: number;

  @ApiProperty({ example: 103.769064 })
  longitude!: number;
}
