import { AccountValidationError } from '../../../../../src/modules/accounts/domain/account-validation.error.js';
import { EmailVerificationCode } from '../../../../../src/modules/accounts/domain/email-verification-code.js';
import {
  AccountStatus,
  NEW_ACCOUNT_DEFAULTS,
} from '../../../../../src/modules/accounts/domain/account-status.js';
import { NusEmail } from '../../../../../src/modules/accounts/domain/nus-email.js';
import { assertPasswordMeetsPolicy } from '../../../../../src/modules/accounts/domain/password-policy.js';
import { PhoneNumber } from '../../../../../src/modules/accounts/domain/phone-number.js';
import { Username } from '../../../../../src/modules/accounts/domain/username.js';

function expectValidationCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Expected validation error ${code}.`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AccountValidationError);
    expect(error).toMatchObject({ code });
  }
}

describe('account domain rules', () => {
  describe('Username', () => {
    it('accepts an alphanumeric username', () => {
      expect(Username.create('Arthur3219').value).toBe('Arthur3219');
    });

    it.each(['', 'arthur_3219', 'arthur 3219', 'arthur-3219'])(
      'rejects invalid username %p',
      (username) => {
        expect(() => Username.create(username)).toThrow(AccountValidationError);
      },
    );
  });

  describe('NusEmail', () => {
    it('normalizes a valid NUS email address', () => {
      expect(NusEmail.create('  Student@U.NUS.EDU ').value).toBe(
        'student@u.nus.edu',
      );
    });

    it.each([
      '',
      'student@nus.edu',
      'student@gmail.com',
      'student@@u.nus.edu',
      '.student@u.nus.edu',
      'student..name@u.nus.edu',
    ])('rejects invalid NUS email %p', (email) => {
      expect(() => NusEmail.create(email)).toThrow(AccountValidationError);
    });
  });

  describe('PhoneNumber', () => {
    it('accepts a digits-only phone number', () => {
      expect(PhoneNumber.create('91234567').value).toBe('91234567');
    });

    it.each(['', '1234567', '1234567890123456', '+6591234567', '9123 4567'])(
      'rejects invalid phone number %p',
      (phoneNumber) => {
        expect(() => PhoneNumber.create(phoneNumber)).toThrow(
          AccountValidationError,
        );
      },
    );
  });

  describe('password policy', () => {
    it('accepts a password satisfying every requirement', () => {
      expect(() => assertPasswordMeetsPolicy('Strong!Pass')).not.toThrow();
    });

    it.each([
      ['Short!', 'PASSWORD_TOO_SHORT'],
      ['lowercase!', 'PASSWORD_MISSING_UPPERCASE'],
      ['UPPERCASE!', 'PASSWORD_MISSING_LOWERCASE'],
      ['NoSpecial123', 'PASSWORD_MISSING_SPECIAL_CHARACTER'],
    ])('rejects an invalid password with code %s', (password, code) => {
      expectValidationCode(() => assertPasswordMeetsPolicy(password), code);
    });
  });

  describe('EmailVerificationCode', () => {
    it('preserves a six-digit code including leading zeroes', () => {
      expect(EmailVerificationCode.create('042731').value).toBe('042731');
    });

    it.each(['', '12345', '1234567', '12345a'])(
      'rejects invalid verification code %p',
      (code) => {
        expect(() => EmailVerificationCode.create(code)).toThrow(
          AccountValidationError,
        );
      },
    );
  });

  it('defines safe defaults for a newly registered account', () => {
    expect(NEW_ACCOUNT_DEFAULTS).toEqual({
      isAdmin: false,
      status: AccountStatus.PendingVerification,
    });
  });
});
