import { AccountValidationError } from './account-validation.error.js';

const NUS_EMAIL_DOMAIN = 'u.nus.edu';
const LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

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
