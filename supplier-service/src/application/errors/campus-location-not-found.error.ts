export class CampusLocationNotFoundError extends Error {
  readonly code = 'CAMPUS_LOCATION_NOT_FOUND';
  readonly field = 'campusLocationId';

  constructor(public readonly campusLocationId: string) {
    super('The selected NUS campus location was not found.');
    this.name = 'CampusLocationNotFoundError';
  }
}
