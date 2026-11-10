/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of phone number code (PhoneNumber).
 * Author review: Validated PhoneNumber input handling, return values, and thrown errors in user-service/phone-number.ts; edited naming and formatting for readability.
 */

import { AccountValidationError } from './account-validation.error.js';

const PHONE_NUMBER_PATTERN = /^[0-9]{8,15}$/;

export class PhoneNumber {
  private constructor(public readonly value: string) {}

  static create(value: string): PhoneNumber {
    if (value.length === 0) {
      throw new AccountValidationError(
        'phoneNumber',
        'PHONE_NUMBER_REQUIRED',
        'Phone number is required.',
      );
    }

    if (!PHONE_NUMBER_PATTERN.test(value)) {
      throw new AccountValidationError(
        'phoneNumber',
        'PHONE_NUMBER_INVALID_FORMAT',
        'Phone number must contain between 8 and 15 digits.',
      );
    }

    return new PhoneNumber(value);
  }
}
