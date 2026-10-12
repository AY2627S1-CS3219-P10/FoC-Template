import { AccountValidationError } from './account-validation.error.js';

export const REPORT_DESCRIPTION_MAX_LENGTH = 500;

export class ReportDescription {
  private constructor(readonly value: string) {}

  static create(rawValue: string): ReportDescription {
    const value = rawValue.trim();

    if (value.length === 0 || value.length > REPORT_DESCRIPTION_MAX_LENGTH) {
      throw new AccountValidationError(
        'description',
        'REPORT_DESCRIPTION_INVALID',
        `Description must contain between 1 and ${REPORT_DESCRIPTION_MAX_LENGTH} characters.`,
      );
    }

    return new ReportDescription(value);
  }
}
