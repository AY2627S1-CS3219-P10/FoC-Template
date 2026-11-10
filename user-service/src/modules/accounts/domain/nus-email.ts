/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of nus email code (EMAIL_MAXIMUM_LENGTH, NusEmail).
 * Author review: Validated EMAIL_MAXIMUM_LENGTH, NusEmail input handling, return values, and thrown errors in user-service/nus-email.ts; edited naming and formatting for readability.
 */

import { AccountValidationError } from './account-validation.error.js';

const NUS_EMAIL_DOMAIN = 'u.nus.edu';
const LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
export const EMAIL_MAXIMUM_LENGTH = 254;

export class NusEmail {
  private constructor(public readonly value: string) {}

  static create(value: string): NusEmail {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue.length === 0) {
      throw new AccountValidationError(
        'email',
        'EMAIL_REQUIRED',
        'NUS email address is required.',
      );
    }

    if (normalizedValue.length > EMAIL_MAXIMUM_LENGTH) {
      throw new AccountValidationError(
        'email',
        'EMAIL_TOO_LONG',
        `Email address must contain at most ${EMAIL_MAXIMUM_LENGTH} characters.`,
      );
    }

    const parts = normalizedValue.split('@');
    const localPart = parts[0] ?? '';
    const domain = parts[1] ?? '';
    const hasValidLocalPart =
      LOCAL_PART_PATTERN.test(localPart) &&
      !localPart.startsWith('.') &&
      !localPart.endsWith('.') &&
      !localPart.includes('..');

    if (
      parts.length !== 2 ||
      domain !== NUS_EMAIL_DOMAIN ||
      !hasValidLocalPart
    ) {
      throw new AccountValidationError(
        'email',
        'EMAIL_INVALID_NUS_ADDRESS',
        'Email address must be a valid u.nus.edu address.',
      );
    }

    return new NusEmail(normalizedValue);
  }
}
