/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of system clock code (SystemClock).
 * Author review: Validated SystemClock value handling and returned results in user-service/system-clock.ts; edited naming and formatting for readability.
 */

import type { ClockPort } from '../application/ports/clock.port.js';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
