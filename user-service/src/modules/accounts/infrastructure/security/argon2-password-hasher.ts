import { argon2id, hash, verify } from 'argon2';

import type { PasswordHasherPort } from '../../application/ports/password-hasher.port.js';
import type { PasswordVerifierPort } from '../../application/ports/password-verifier.port.js';

const ARGON2ID_MEMORY_COST_KIB = 19 * 1024;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_TIME_COST = 2;
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$szs3rCXjbneHs/RPrViKvg$4SlXIWMDYQ5l+mBEf2FcgT+V9wpllgOIqa0kFrOd2Sk';

export class Argon2PasswordHasher
  implements PasswordHasherPort, PasswordVerifierPort
{
  hash(password: string): Promise<string> {
    return hash(password, {
      memoryCost: ARGON2ID_MEMORY_COST_KIB,
      parallelism: ARGON2ID_PARALLELISM,
      timeCost: ARGON2ID_TIME_COST,
      type: argon2id,
    });
  }

  verify(password: string, passwordHash: string | null): Promise<boolean> {
    return verify(passwordHash ?? DUMMY_PASSWORD_HASH, password);
  }
}
