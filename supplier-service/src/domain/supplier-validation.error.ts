// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
export type SupplierValidationField =
  | 'campusLocationId'
  | 'category'
  | 'categories'
  | 'closesAt'
  | 'floor'
  | 'imageUrl'
  | 'locationDescription'
  | 'location'
  | 'name'
  | 'opensAt'
  | 'supplier';

export class SupplierValidationError extends Error {
  constructor(
    public readonly field: SupplierValidationField,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SupplierValidationError';
  }
}
