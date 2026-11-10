/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of administrator seed error code (AdministratorSeedError).
 * Author review: Checked AdministratorSeedError error messages and codes ADMINISTRATOR_SEED_INVALID; standardized exception naming and formatting.
 */

export class AdministratorSeedError extends Error {
  public readonly code = 'ADMINISTRATOR_SEED_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'AdministratorSeedError';
  }
}
