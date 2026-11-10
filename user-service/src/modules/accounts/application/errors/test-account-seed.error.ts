/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of test-account seed error values.
 * Author review: Checked TestAccountSeedError error messages and exposed properties; edited exception naming and formatting.
 */

export class TestAccountSeedError extends Error {
  readonly code = 'TEST_ACCOUNT_SEED_INVALID';

  constructor(message: string) {
    super(message);
    this.name = TestAccountSeedError.name;
  }
}
