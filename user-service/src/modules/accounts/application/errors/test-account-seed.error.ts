export class TestAccountSeedError extends Error {
  readonly code = 'TEST_ACCOUNT_SEED_INVALID';

  constructor(message: string) {
    super(message);
    this.name = TestAccountSeedError.name;
  }
}
