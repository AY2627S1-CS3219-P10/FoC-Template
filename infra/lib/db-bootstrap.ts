/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of database bootstrap task commands.
 * Author review: Checked passwordVariable, bootstrapScript property values and existing resource references in db-bootstrap.ts; edited declaration naming and TypeScript formatting.
 */

/** The environment variable that carries a login's password into the task. */
export function passwordVariable(login: string): string {
  return `DB_PASSWORD_${login.toUpperCase()}`;
}

/**
 * Creates one login and one database per service, and is safe to run again.
 *
 * - The master user is not a superuser on RDS, so it needs the GRANT before it
 *   can make a login the owner of a database (Postgres 16+).
 * - The owner can create the citext extension its migration needs, because
 *   citext is a trusted extension.
 * - The REVOKE stops one service's login connecting to another's database.
 * - Passwords come from the environment through \getenv, so they are never on
 *   a command line.
 */
export function bootstrapScript(logins: readonly string[]): string {
  const sql = logins.flatMap((login) => [
    `\\getenv password ${passwordVariable(login)}`,
    `SELECT 'CREATE ROLE ${login}' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${login}')\\gexec`,
    `ALTER ROLE ${login} WITH LOGIN PASSWORD :'password';`,
    `GRANT ${login} TO CURRENT_USER;`,
    `SELECT 'CREATE DATABASE ${login} OWNER ${login}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${login}')\\gexec`,
    `REVOKE ALL ON DATABASE ${login} FROM PUBLIC;`,
  ]);
  return [
    'set -eu',
    "psql --set=ON_ERROR_STOP=1 <<'SQL'",
    ...sql,
    'SQL',
    'echo "Database bootstrap finished"',
  ].join('\n');
}
