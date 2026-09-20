import { argon2id, hash } from 'argon2';

import type { PasswordHasherPort } from '../../application/ports/password-hasher.port.js';

const ARGON2ID_MEMORY_COST_KIB = 19 * 1024;
const ARGON2ID_PARALLELISM = 1;
const ARGON2ID_TIME_COST = 2;

export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return hash(password, {
      memoryCost: ARGON2ID_MEMORY_COST_KIB,
      parallelism: ARGON2ID_PARALLELISM,
      timeCost: ARGON2ID_TIME_COST,
      type: argon2id,
    });
  }
}
