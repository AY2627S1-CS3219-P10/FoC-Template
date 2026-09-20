import { verify } from 'argon2';

import { Argon2PasswordHasher } from '../../../../../src/modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { HmacVerificationCodeHasher } from '../../../../../src/modules/accounts/infrastructure/security/hmac-verification-code-hasher.js';
import { JoseAccessToken } from '../../../../../src/modules/accounts/infrastructure/security/jose-access-token.js';
import { SecureRefreshToken } from '../../../../../src/modules/accounts/infrastructure/security/secure-refresh-token.js';
import { SixDigitCodeGenerator } from '../../../../../src/modules/accounts/infrastructure/security/six-digit-code-generator.js';
import { UuidGenerator } from '../../../../../src/modules/accounts/infrastructure/security/uuid-generator.js';

describe('account security adapters', () => {
  it('hashes passwords with the configured Argon2id parameters', async () => {
    const hasher = new Argon2PasswordHasher();

    const passwordHash = await hasher.hash('Strong!Pass');

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(verify(passwordHash, 'Strong!Pass')).resolves.toBe(true);
    await expect(hasher.verify('Strong!Pass', passwordHash)).resolves.toBe(
      true,
    );
    await expect(hasher.verify('Incorrect!Pass', passwordHash)).resolves.toBe(
      false,
    );
    await expect(hasher.verify('Strong!Pass', null)).resolves.toBe(false);
    expect(passwordHash).not.toContain('Strong!Pass');
  });

  it('generates high-entropy refresh tokens and stable non-reversible hashes', () => {
    const tokens = new SecureRefreshToken();
    const firstToken = tokens.generate();
    const secondToken = tokens.generate();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondToken).not.toBe(firstToken);
    expect(tokens.hash(firstToken)).toHaveLength(64);
    expect(tokens.hash(firstToken)).toBe(tokens.hash(firstToken));
    expect(tokens.hash(firstToken)).not.toContain(firstToken);
  });

  it('issues and verifies scoped JWT access-token claims', async () => {
    const accessTokens = new JoseAccessToken(
      'test-jwt-access-token-secret-32-characters',
    );
    const now = new Date();
    const token = await accessTokens.issue({
      expiresAt: new Date(now.getTime() + 60_000),
      isAdmin: false,
      issuedAt: now,
      sessionId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
      userId: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
    });

    await expect(accessTokens.verify(token)).resolves.toEqual({
      isAdmin: false,
      sessionId: 'a23394c1-c131-4b77-bf0d-c39bc11bf81e',
      userId: '4a84f480-b1cb-4b81-b632-8bb49034b9e7',
    });
    await expect(accessTokens.verify(`${token}tampered`)).rejects.toThrow();
  });

  it('generates different RFC 4122 version 4 UUIDs', () => {
    const generator = new UuidGenerator();

    const firstId = generator.generate();
    const secondId = generator.generate();

    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(secondId).not.toBe(firstId);
  });

  it('generates six-digit email verification codes', () => {
    const generator = new SixDigitCodeGenerator();

    for (let index = 0; index < 100; index += 1) {
      expect(generator.generate()).toMatch(/^[0-9]{6}$/);
    }
  });

  it('hashes verification codes with a server-held secret', () => {
    const hasher = new HmacVerificationCodeHasher(
      'test-email-verification-secret-32-characters',
    );
    const otherHasher = new HmacVerificationCodeHasher(
      'different-email-verification-secret-value',
    );

    expect(hasher.hash('042731')).toHaveLength(64);
    expect(hasher.hash('042731')).toBe(hasher.hash('042731'));
    expect(hasher.hash('042731')).not.toBe(otherHasher.hash('042731'));
    expect(hasher.hash('042731')).not.toContain('042731');
  });
});
