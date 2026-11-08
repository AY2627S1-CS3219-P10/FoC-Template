import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT_COUNT = 11;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SECRETS_DIRECTORY = resolve(SCRIPT_DIRECTORY, 'secrets');
const force = process.argv.includes('--force');

function makePassword() {
  return `Foc!${randomBytes(24).toString('base64url')}aA1`;
}

async function writeSecret(name, value) {
  const path = resolve(SECRETS_DIRECTORY, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: force ? 'w' : 'wx',
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

const password = makePassword();
const accounts = Array.from({ length: ACCOUNT_COUNT }, (_, index) => {
  const suffix = String(index + 1).padStart(2, '0');

  return {
    email: `foc-loadtest-${suffix}@u.nus.edu`,
    password,
    phoneNumber: `880000${suffix}`,
    username: `FocLoadTest${suffix}`,
  };
});

await mkdir(SECRETS_DIRECTORY, { recursive: true });

try {
  await Promise.all([
    writeSecret('test-account-seed.json', accounts),
    writeSecret('stress-user.json', {
      email: accounts[0].email,
      password: accounts[0].password,
    }),
    writeSecret(
      'couriers.json',
      accounts.slice(1).map(({ email, password: accountPassword }) => ({
        email,
        password: accountPassword,
      })),
    ),
  ]);
} catch (error) {
  if (error?.code === 'EEXIST') {
    throw new Error(
      'Fixture files already exist. Use --force only when intentionally rotating every test credential.',
    );
  }

  throw error;
}

console.log(
  'Prepared one requester and ten couriers in infra/load/secrets. Files are ignored by Git and mode 0600.',
);
