import { verify } from 'argon2';

import { Argon2PasswordHasher } from '../../../../../src/modules/accounts/infrastructure/security/argon2-password-hasher.js';
import { HmacVerificationCodeHasher } from '../../../../../src/modules/accounts/infrastructure/security/hmac-verification-code-hasher.js';
import { SixDigitCodeGenerator } from '../../../../../src/modules/accounts/infrastructure/security/six-digit-code-generator.js';
import { UuidGenerator } from '../../../../../src/modules/accounts/infrastructure/security/uuid-generator.js';

describe('account security adapters', () => {
  it('hashes passwords with the configured Argon2id parameters', async () => {
    const hasher = new Argon2PasswordHasher();

    const passwordHash = await hasher.hash('Strong!Pass');

    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(verify(passwordHash, 'Strong!Pass')).resolves.toBe(true);
    expect(passwordHash).not.toContain('Strong!Pass');
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
