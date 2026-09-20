import type { VerificationEmailMessage } from '../../../../../src/modules/accounts/application/ports/verification-email-delivery.port.js';
import type { RegisterAccountResult } from '../../../../../src/modules/accounts/application/use-cases/register-account.use-case.js';
import { RegisterWithEmailVerificationUseCase } from '../../../../../src/modules/accounts/application/use-cases/register-with-email-verification.use-case.js';
import { AccountStatus } from '../../../../../src/modules/accounts/domain/account-status.js';

const ACCOUNT: RegisterAccountResult = {
  email: 'student@u.nus.edu',
  id: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
  isAdmin: false,
  phoneNumber: '91234567',
  status: AccountStatus.PendingVerification,
  username: 'Arthur3219',
};

const EXPIRES_AT = new Date('2026-09-20T02:10:00.000Z');

describe('RegisterWithEmailVerificationUseCase', () => {
  it('registers the account, issues a code, and queues its delivery', async () => {
    const queuedMessages: VerificationEmailMessage[] = [];
    const useCase = new RegisterWithEmailVerificationUseCase({
      emailDelivery: {
        enqueue: (message) => {
          queuedMessages.push(message);
          return Promise.resolve();
        },
      },
      issueEmailVerificationCode: {
        execute: () =>
          Promise.resolve({
            code: '042731',
            expiresAt: EXPIRES_AT,
            verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
          }),
      },
      registerAccount: {
        execute: () => Promise.resolve(ACCOUNT),
      },
    });

    await expect(
      useCase.execute({
        email: ACCOUNT.email,
        password: 'Strong!Pass',
        phoneNumber: ACCOUNT.phoneNumber,
        username: ACCOUNT.username,
      }),
    ).resolves.toEqual(ACCOUNT);
    expect(queuedMessages).toEqual([
      {
        code: '042731',
        expiresAt: EXPIRES_AT,
        recipientEmail: ACCOUNT.email,
        verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
      },
    ]);
  });

  it('does not issue or queue a code when registration fails', async () => {
    let issueAttempts = 0;
    let enqueueAttempts = 0;
    const issueEmailVerificationCode = {
      execute: () => {
        issueAttempts += 1;
        return Promise.resolve({
          code: '042731',
          expiresAt: EXPIRES_AT,
          verificationId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
        });
      },
    };
    const emailDelivery = {
      enqueue: () => {
        enqueueAttempts += 1;
        return Promise.resolve();
      },
    };
    const failure = new Error('registration failed');
    const useCase = new RegisterWithEmailVerificationUseCase({
      emailDelivery,
      issueEmailVerificationCode,
      registerAccount: {
        execute: () => Promise.reject(failure),
      },
    });

    await expect(
      useCase.execute({
        email: ACCOUNT.email,
        password: 'Strong!Pass',
        phoneNumber: ACCOUNT.phoneNumber,
        username: ACCOUNT.username,
      }),
    ).rejects.toBe(failure);
    expect(issueAttempts).toBe(0);
    expect(enqueueAttempts).toBe(0);
  });
});
