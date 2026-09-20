import type {
  EmailVerificationRepositoryPort,
  IssueEmailVerificationCodeRecord,
  VerifyEmailInput,
} from '../../application/ports/email-verification-repository.port.js';
import {
  type PrismaClient,
  UserStatus,
} from '../../../../generated/prisma/client.js';

export class PrismaEmailVerificationRepository implements EmailVerificationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  findPendingAccountByEmail(
    email: string,
  ): Promise<{ email: string; id: string } | null> {
    return this.prisma.user.findFirst({
      select: { email: true, id: true },
      where: {
        email,
        status: UserStatus.PENDING_VERIFICATION,
      },
    });
  }

  issueCode(record: IssueEmailVerificationCodeRecord): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const account = await transaction.user.findUnique({
        select: { status: true },
        where: { id: record.userId },
      });

      if (account?.status !== UserStatus.PENDING_VERIFICATION) {
        return false;
      }

      await transaction.emailVerificationCode.updateMany({
        data: { usedAt: record.createdAt },
        where: {
          usedAt: null,
          userId: record.userId,
        },
      });
      await transaction.emailVerificationCode.create({
        data: record,
      });

      return true;
    });
  }

  verifyAndActivate(input: VerifyEmailInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const account = await transaction.user.findUnique({
        select: {
          emailVerificationCodes: {
            orderBy: { createdAt: 'desc' },
            select: {
              attemptCount: true,
              codeHash: true,
              expiresAt: true,
              id: true,
              usedAt: true,
            },
            take: 1,
          },
          id: true,
          status: true,
        },
        where: { email: input.email },
      });
      const verificationCode = account?.emailVerificationCodes[0];

      if (
        !account ||
        account.status !== UserStatus.PENDING_VERIFICATION ||
        !verificationCode ||
        verificationCode.usedAt !== null ||
        verificationCode.expiresAt <= input.now ||
        verificationCode.attemptCount >= input.maximumAttempts
      ) {
        return false;
      }

      if (verificationCode.codeHash !== input.candidateCodeHash) {
        await transaction.emailVerificationCode.updateMany({
          data: { attemptCount: { increment: 1 } },
          where: {
            attemptCount: { lt: input.maximumAttempts },
            expiresAt: { gt: input.now },
            id: verificationCode.id,
            usedAt: null,
          },
        });

        return false;
      }

      const consumedCode = await transaction.emailVerificationCode.updateMany({
        data: { usedAt: input.now },
        where: {
          attemptCount: { lt: input.maximumAttempts },
          codeHash: input.candidateCodeHash,
          expiresAt: { gt: input.now },
          id: verificationCode.id,
          usedAt: null,
        },
      });

      if (consumedCode.count !== 1) {
        return false;
      }

      await transaction.user.update({
        data: {
          emailVerifiedAt: input.now,
          status: UserStatus.ACTIVE,
        },
        where: { id: account.id },
      });

      return true;
    });
  }
}
