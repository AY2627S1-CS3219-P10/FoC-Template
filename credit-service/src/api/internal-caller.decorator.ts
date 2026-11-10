/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of internal caller decorator code (INTERNAL_CALLER_METADATA, InternalCaller, InternalCallerOnly).
 * Author review: Validated INTERNAL_CALLER_METADATA, InternalCaller existing type members and constant values in credit-service/internal-caller.decorator.ts; edited naming and formatting for readability.
 */

import { SetMetadata } from '@nestjs/common';

export const INTERNAL_CALLER_METADATA = 'credit-service:internal-caller';

export type InternalCaller = 'monitoring' | 'order-service' | 'user-service';

export const InternalCallerOnly = (caller: InternalCaller) =>
  SetMetadata(INTERNAL_CALLER_METADATA, caller);
