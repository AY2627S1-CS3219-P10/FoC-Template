/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of campus location not found error code (CampusLocationNotFoundError).
 * Author review: Checked CampusLocationNotFoundError error messages and codes CAMPUS_LOCATION_NOT_FOUND; standardized exception naming and formatting.
 */

export class CampusLocationNotFoundError extends Error {
  readonly code = 'CAMPUS_LOCATION_NOT_FOUND';
  readonly field = 'campusLocationId';

  constructor(public readonly campusLocationId: string) {
    super('The selected NUS campus location was not found.');
    this.name = 'CampusLocationNotFoundError';
  }
}
