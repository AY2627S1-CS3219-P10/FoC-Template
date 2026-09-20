export class AdministratorSeedError extends Error {
  public readonly code = 'ADMINISTRATOR_SEED_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'AdministratorSeedError';
  }
}
