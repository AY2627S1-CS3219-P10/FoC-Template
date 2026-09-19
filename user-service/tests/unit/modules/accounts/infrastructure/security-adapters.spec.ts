import { verify } from 'argon2';

import { Argon2PasswordHasher } from '../../../../../src/modules/accounts/infrastructure/security/argon2-password-hasher.js';
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
});
